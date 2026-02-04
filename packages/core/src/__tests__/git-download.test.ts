import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { safeRm } from '../fs/safe-rm.js';
import { getGitDownloadsDir } from '../cache/paths.js';

// Mock giget's downloadTemplate
vi.mock('giget', () => ({
   downloadTemplate: vi.fn(),
}));

import { withGitDownload } from '../git-download.js';
import { downloadTemplate } from 'giget';

const testDir = join(process.cwd(), 'test-fixtures', 'git-download'),
      mockedDownloadTemplate = vi.mocked(downloadTemplate);

describe('withGitDownload', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      vi.clearAllMocks();
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('cleans up after successful operation', async () => {
      let capturedDir = '';

      // Mock downloadTemplate to create a directory
      mockedDownloadTemplate.mockImplementation(async (_template, options) => {
         const dir = options?.dir ?? '';

         capturedDir = dir;
         await mkdir(dir, { recursive: true });
         return { dir, source: 'github:test/repo' };
      });

      const result = await withGitDownload('github:test/repo#main', testDir, async (dir) => {
         // Directory should exist during operation
         expect(existsSync(dir)).toBe(true);
         return 'success';
      });

      expect(result).toBe('success');
      // Specific download directory should be cleaned up after operation
      expect(existsSync(capturedDir)).toBe(false);
   });

   it('cleans up after failed operation', async () => {
      let capturedDir = '';

      mockedDownloadTemplate.mockImplementation(async (_template, options) => {
         const dir = options?.dir ?? '';

         capturedDir = dir;
         await mkdir(dir, { recursive: true });
         return { dir, source: 'github:test/repo' };
      });

      await expect(
         withGitDownload('github:test/repo#main', testDir, async () => {
            throw new Error('Operation failed');
         }),
      ).rejects.toThrow('Operation failed');

      // Specific download directory should be cleaned up even after error
      expect(existsSync(capturedDir)).toBe(false);
   });

   it('cleans up after download failure', async () => {
      const downloadsDir = getGitDownloadsDir(testDir);

      mockedDownloadTemplate.mockRejectedValue(new Error('Download failed'));

      await expect(
         withGitDownload('github:test/repo#main', testDir, async () => 'success'),
      ).rejects.toThrow('Download failed');

      // Directory should be cleaned up even after download error
      expect(existsSync(downloadsDir)).toBe(false);
   });

   it('creates unique directory names with gitref', async () => {
      const capturedDirs: string[] = [];

      mockedDownloadTemplate.mockImplementation(async (_template, options) => {
         const dir = options?.dir ?? '';

         capturedDirs.push(dir);
         await mkdir(dir, { recursive: true });
         return { dir, source: 'github:test/repo' };
      });

      // Call with different refs
      await withGitDownload('github:org/repo#main', testDir, async () => 'result1');
      await withGitDownload('github:org/repo#develop', testDir, async () => 'result2');

      expect(capturedDirs).toHaveLength(2);
      expect(capturedDirs[0]).not.toBe(capturedDirs[1]);

      // Both should contain the ref in the path
      expect(capturedDirs[0]).toContain('main');
      expect(capturedDirs[1]).toContain('develop');
   });
});
