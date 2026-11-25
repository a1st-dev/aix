import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { getGitDownloadsDir } from '../cache/paths.js';
import { safeRm } from '../fs/safe-rm.js';
import { createCacheKey, createDownloadKey, withGitDownload } from '../git-download.js';
import {
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../runtime/index.js';

const testDir = join(process.env.HOME ?? '', 'test-fixtures', 'git-download');

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

describe('createCacheKey', () => {
   it('returns different keys for urls that share a long prefix', () => {
      const first = createCacheKey('https://github.com/acme/first-skill'),
            second = createCacheKey('https://github.com/acme/second-skill');

      expect(first).not.toBe(second);
   });

   it('returns different keys when only the ref or the path differs', () => {
      const url = 'https://github.com/acme/a-long-repository-name',
            keys = [
               createCacheKey(url, 'main', 'rules/style.md'),
               createCacheKey(url, 'v2', 'rules/style.md'),
               createCacheKey(url, 'main', 'rules/tests.md'),
               createCacheKey(url, 'main', undefined),
               createCacheKey(url, undefined, 'main'),
            ];

      expect(new Set(keys).size).toBe(keys.length);
   });

   it('returns the same key for the same parts', () => {
      const first = createCacheKey('github:acme/repo', 'main', 'skills/pdf'),
            second = createCacheKey('github:acme/repo', 'main', 'skills/pdf');

      expect(first).toBe(second);
   });

   it('returns a key that is safe to use as a directory name', () => {
      const key = createCacheKey('https://github.com/acme/repo', '../../etc', 'a/b');

      expect(key).toMatch(/^[a-f0-9]{32}$/);
   });
});

describe('createDownloadKey', () => {
   it('returns different keys when a hyphen and a slash trade places', () => {
      const first = createDownloadKey('github:a/b-c'),
            second = createDownloadKey('github:a-b/c');

      expect(first).not.toBe(second);
   });

   it('returns different keys for the same repo on different providers', () => {
      const first = createDownloadKey('github:org/repo#main'),
            second = createDownloadKey('gitlab:org/repo#main');

      expect(first).not.toBe(second);
   });

   it('keeps path separators and traversal out of the key when the ref contains them', () => {
      const key = createDownloadKey('github:org/repo#feature/../../escape');

      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(key).toContain('org-repo-feature');
   });

   it('returns different keys for different https urls', () => {
      const first = createDownloadKey('https://github.com/acme/first-config'),
            second = createDownloadKey('https://github.com/acme/second-config');

      expect(first).not.toBe(second);
   });
});

function createRuntimeAdapter(overrides: Partial<RuntimeAdapter>): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      ...overrides,
   };
}
