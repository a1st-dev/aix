import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { getGitDownloadsDir } from '../cache/paths.js';
import { safeRm } from '../fs/safe-rm.js';
import { withGitDownload } from '../git-download.js';
import {
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../runtime/index.js';

const testDir = join(process.cwd(), 'test-fixtures', 'git-download');

describe('withGitDownload', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      resetRuntimeAdapter();
      await safeRm(testDir, { force: true });
   });

   it('cleans up after successful operation', async () => {
      let capturedDir = '';

      const adapter = createRuntimeAdapter({
         git: {
            downloadTemplate: async (_template, options) => {
               const dir = options.dir ?? '';

               capturedDir = dir;
               await mkdir(dir, { recursive: true });

               return { dir };
            },
         },
      });

      const result = await withRuntimeAdapter(adapter, async () => {
         return withGitDownload('github:test/repo#main', testDir, async (dir) => {
            expect(existsSync(dir)).toStrictEqual(true);

            return 'success';
         });
      });

      expect(result).toBe('success');
      expect(existsSync(capturedDir)).toStrictEqual(false);
   });

   it('cleans up after failed operation', async () => {
      let capturedDir = '';

      const adapter = createRuntimeAdapter({
         git: {
            downloadTemplate: async (_template, options) => {
               const dir = options.dir ?? '';

               capturedDir = dir;
               await mkdir(dir, { recursive: true });

               return { dir };
            },
         },
      });

      await expect(
         withRuntimeAdapter(adapter, async () => {
            return withGitDownload('github:test/repo#main', testDir, async () => {
               throw new Error('Operation failed');
            });
         }),
      ).rejects.toThrow('Operation failed');

      expect(existsSync(capturedDir)).toStrictEqual(false);
   });

   it('cleans up after download failure', async () => {
      const downloadsDir = getGitDownloadsDir(testDir),
            adapter = createRuntimeAdapter({
               git: {
                  downloadTemplate: async () => {
                     throw new Error('Download failed');
                  },
               },
            });

      await expect(
         withRuntimeAdapter(adapter, async () => {
            return withGitDownload('github:test/repo#main', testDir, async () => {
               return 'success';
            });
         }),
      ).rejects.toThrow('Download failed');

      expect(existsSync(downloadsDir)).toStrictEqual(false);
   });

   it('creates unique directory names with gitref', async () => {
      const capturedDirs: string[] = [],
            adapter = createRuntimeAdapter({
               git: {
                  downloadTemplate: async (_template, options) => {
                     const dir = options.dir ?? '';

                     capturedDirs.push(dir);
                     await mkdir(dir, { recursive: true });

                     return { dir };
                  },
               },
            });

      await withRuntimeAdapter(adapter, async () => {
         await withGitDownload('github:org/repo#main', testDir, async () => {
            return 'result1';
         });
         await withGitDownload('github:org/repo#develop', testDir, async () => {
            return 'result2';
         });
      });

      expect(capturedDirs).toHaveLength(2);
      expect(capturedDirs[0]).not.toBe(capturedDirs[1]);
      expect(capturedDirs[0]).toContain('main');
      expect(capturedDirs[1]).toContain('develop');
   });
});

function createRuntimeAdapter(overrides: Partial<RuntimeAdapter>): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      ...overrides,
   };
}
