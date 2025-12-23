import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { existsSync } from 'node:fs';
import {
   getCacheStatus,
   clearCache,
   cleanStaleCache,
   getBackupsDir,
   getCacheDir,
   getTmpDir,
} from '../cache/index.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.cwd(), 'test-fixtures', 'cache-test');

describe('cache utilities', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   describe('getCacheStatus', () => {
      it('returns zero values for empty project', async () => {
         const status = await getCacheStatus(testDir);

         expect(status.totalSize).toBe(0);
         expect(status.backups.size).toBe(0);
         expect(status.backups.count).toBe(0);
         expect(status.gitCache.size).toBe(0);
         expect(status.npmCache.size).toBe(0);
      });

      it('calculates correct sizes for cache entries', async () => {
         // Create some cache files in the new .tmp/ structure
         const backupsDir = getBackupsDir(testDir),
               cacheDir = getCacheDir(testDir);

         await mkdir(backupsDir, { recursive: true });
         await mkdir(cacheDir, { recursive: true });

         await writeFile(join(backupsDir, 'ai.json.backup'), 'backup content');
         await writeFile(join(cacheDir, 'rule-cache'), 'cached rule content');

         const status = await getCacheStatus(testDir);

         expect(status.totalSize).toBeGreaterThan(0);
         expect(status.backups.count).toBe(1);
         expect(status.gitCache.count).toBe(1);
      });

      it('includes legacy paths in status', async () => {
         // Create files in legacy locations
         const legacyBackups = join(testDir, '.aix', 'backups'),
               legacyCache = join(testDir, '.aix', 'cache');

         await mkdir(legacyBackups, { recursive: true });
         await mkdir(legacyCache, { recursive: true });

         await writeFile(join(legacyBackups, 'old.backup'), 'old backup');
         await writeFile(join(legacyCache, 'old-cache'), 'old cache');

         const status = await getCacheStatus(testDir);

         expect(status.backups.count).toBe(1);
         expect(status.gitCache.count).toBe(1);
      });
   });

   describe('clearCache', () => {
      it('returns empty result for project without cache', async () => {
         const result = await clearCache(testDir);

         expect(result.freedBytes).toBe(0);
         expect(result.deletedPaths).toHaveLength(0);
      });

      it('clears .tmp directory', async () => {
         const tmpDir = getTmpDir(testDir),
               backupsDir = getBackupsDir(testDir);

         await mkdir(backupsDir, { recursive: true });
         await writeFile(join(backupsDir, 'test.backup'), 'backup content');

         expect(existsSync(tmpDir)).toBe(true);

         const result = await clearCache(testDir);

         expect(result.freedBytes).toBeGreaterThan(0);
         expect(existsSync(tmpDir)).toBe(false);
      });

      it('clears legacy directories', async () => {
         const legacyBackups = join(testDir, '.aix', 'backups'),
               legacyCache = join(testDir, '.aix', 'cache'),
               legacyNodeModules = join(testDir, '.aix', 'node_modules');

         await mkdir(legacyBackups, { recursive: true });
         await mkdir(legacyCache, { recursive: true });
         await mkdir(legacyNodeModules, { recursive: true });

         await writeFile(join(legacyBackups, 'old.backup'), 'content');
         await writeFile(join(legacyCache, 'old-cache'), 'content');
         await writeFile(join(legacyNodeModules, 'package.json'), '{}');

         const result = await clearCache(testDir);

         expect(result.freedBytes).toBeGreaterThan(0);
         expect(existsSync(legacyBackups)).toBe(false);
         expect(existsSync(legacyCache)).toBe(false);
         expect(existsSync(legacyNodeModules)).toBe(false);
      });

      it('preserves skills directory', async () => {
         const skillsDir = join(testDir, '.aix', 'skills'),
               tmpDir = getTmpDir(testDir);

         await mkdir(skillsDir, { recursive: true });
         await mkdir(join(tmpDir, 'backups'), { recursive: true });

         await writeFile(join(skillsDir, 'SKILL.md'), '# My Skill');
         await writeFile(join(tmpDir, 'backups', 'test.backup'), 'backup');

         await clearCache(testDir);

         expect(existsSync(skillsDir)).toBe(true);
         expect(existsSync(join(skillsDir, 'SKILL.md'))).toBe(true);
      });
   });

   describe('cleanStaleCache', () => {
      it('returns empty result when no stale entries', async () => {
         const result = await cleanStaleCache(testDir);

         expect(result.freedBytes).toBe(0);
         expect(result.deletedPaths).toHaveLength(0);
      });

      it('does not delete recent entries', async () => {
         const cacheDir = getCacheDir(testDir);

         await mkdir(cacheDir, { recursive: true });
         await writeFile(join(cacheDir, 'recent-cache'), 'recent content');

         const result = await cleanStaleCache(testDir, { maxCacheAgeDays: 7 });

         expect(result.deletedPaths).toHaveLength(0);
         expect(existsSync(join(cacheDir, 'recent-cache'))).toBe(true);
      });

      it('respects custom maxCacheAgeDays', async () => {
         const cacheDir = getCacheDir(testDir),
               cacheFile = join(cacheDir, 'cache-entry');

         await mkdir(cacheDir, { recursive: true });
         await writeFile(cacheFile, 'content');

         // Set mtime to 10 days ago to ensure it's stale
         const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
         const { utimes } = await import('node:fs/promises');

         await utimes(cacheFile, tenDaysAgo, tenDaysAgo);

         // With 7 days default, the 10-day-old file should be deleted
         const result = await cleanStaleCache(testDir, { maxCacheAgeDays: 7 });

         expect(result.deletedPaths).toHaveLength(1);
         expect(existsSync(cacheFile)).toBe(false);
      });
   });
});
