import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';
import { safeRm } from '../fs/safe-rm.js';
import { loadFromGit } from '../git-loader.js';
import {
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../runtime/index.js';

interface RecordedDownload {
   source: string;
   dir: string;
   forceClean: boolean | undefined;
}

/**
 * Stands in for giget: writes `<source>` as the content of every requested file so a test
 * can tell which download a result came from.
 */
function createRuntimeAdapter(downloads: RecordedDownload[], filePaths: string[]): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      git: {
         downloadTemplate: async (source, options) => {
            const dir = options.dir ?? '';

            downloads.push({ source, dir, forceClean: options.forceClean });

            await Promise.all(filePaths.map(async (filePath) => {
               await mkdir(dirname(join(dir, filePath)), { recursive: true });
               await writeFile(join(dir, filePath), `content of ${source}`);
            }));

            return { dir };
         },
      },
   };
}

describe('loadFromGit', () => {
   let cacheDir: string;

   beforeEach(() => {
      cacheDir = join(tmpdir(), `aix-test-git-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`);
   });

   afterEach(async () => {
      resetRuntimeAdapter();
      await safeRm(cacheDir, { force: true });
   });

   it('does not serve one ref from the cache of another ref of the same repository', async () => {
      const url = 'https://github.com/acme/a-long-repository-name',
            downloads: RecordedDownload[] = [],
            adapter = createRuntimeAdapter(downloads, ['RULES.md']);

      const [main, release] = await withRuntimeAdapter(adapter, async () => {
         return [
            await loadFromGit({ git: { url, ref: 'main' }, cacheDir, defaultFilePath: 'RULES.md' }),
            await loadFromGit({ git: { url, ref: 'v2' }, cacheDir, defaultFilePath: 'RULES.md' }),
         ];
      });

      expect(downloads).toHaveLength(2);
      expect(downloads[0]?.dir).not.toBe(downloads[1]?.dir);
      expect(main?.content).toBe('content of gh:acme/a-long-repository-name#main');
      expect(release?.content).toBe('content of gh:acme/a-long-repository-name#v2');
   });

   it('uses a separate cache directory for each file path in one repository', async () => {
      const url = 'https://github.com/acme/a-long-repository-name',
            downloads: RecordedDownload[] = [],
            adapter = createRuntimeAdapter(downloads, ['rules/style.md', 'rules/tests.md']);

      await withRuntimeAdapter(adapter, async () => {
         await loadFromGit({ git: { url, path: 'rules/style.md' }, cacheDir, defaultFilePath: 'RULES.md' });
         await loadFromGit({ git: { url, path: 'rules/tests.md' }, cacheDir, defaultFilePath: 'RULES.md' });
      });

      expect(downloads).toHaveLength(2);
      expect(downloads[0]?.dir).not.toBe(downloads[1]?.dir);
   });

   it('reads a repeated request from the cache without downloading again', async () => {
      const git = { url: 'github:acme/rules', ref: 'main', path: 'rules/style.md' },
            downloads: RecordedDownload[] = [],
            adapter = createRuntimeAdapter(downloads, ['rules/style.md']);

      const second = await withRuntimeAdapter(adapter, async () => {
         await loadFromGit({ git, cacheDir, defaultFilePath: 'RULES.md' });

         return loadFromGit({ git, cacheDir, defaultFilePath: 'RULES.md' });
      });

      expect(downloads).toHaveLength(1);
      expect(second.content).toBe('content of github:acme/rules#main');
   });

   it('asks for a clean extraction when it has to download', async () => {
      const downloads: RecordedDownload[] = [],
            adapter = createRuntimeAdapter(downloads, ['RULES.md']);

      await withRuntimeAdapter(adapter, async () => {
         await loadFromGit({ git: { url: 'github:acme/rules' }, cacheDir, defaultFilePath: 'RULES.md' });
      });

      expect(downloads[0]?.forceClean).toStrictEqual(true);
   });
});
