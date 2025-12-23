import pMap from 'p-map';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'pathe';
import { existsSync } from 'node:fs';
import { getCacheDir, getBackupsDir } from './paths.js';
import { safeRm } from '../fs/safe-rm.js';

export interface CleanupOptions {
   maxCacheAgeDays?: number;
   maxBackupAgeDays?: number;
}

export interface CleanupResult {
   deletedPaths: string[];
   freedBytes: number;
}

/**
 * Clean stale cache entries based on age.
 * Called automatically during `aix install`.
 */
export async function cleanStaleCache(
   projectRoot: string,
   options: CleanupOptions = {},
): Promise<CleanupResult> {
   const { maxCacheAgeDays = 7, maxBackupAgeDays = 30 } = options,
         result: CleanupResult = { deletedPaths: [], freedBytes: 0 },
         now = Date.now();

   // Clean git cache (rules + prompts) - both new and legacy paths
   const cacheDirs = [
      getCacheDir(projectRoot),
      join(projectRoot, '.aix', 'cache'), // legacy
   ].filter(existsSync);

   const cacheMaxAge = maxCacheAgeDays * 24 * 60 * 60 * 1000;

   await pMap(cacheDirs, (dir) => cleanOldEntries(dir, now - cacheMaxAge, result), {
      concurrency: 2,
   });

   // Clean old backups (beyond maxBackupAgeDays) - both new and legacy paths
   const backupDirs = [
      getBackupsDir(projectRoot),
      join(projectRoot, '.aix', 'backups'), // legacy
   ].filter(existsSync);

   const backupMaxAge = maxBackupAgeDays * 24 * 60 * 60 * 1000;

   await pMap(backupDirs, (dir) => cleanOldEntries(dir, now - backupMaxAge, result), {
      concurrency: 2,
   });

   return result;
}

async function cleanOldEntries(dir: string, cutoffTime: number, result: CleanupResult): Promise<void> {
   const entries = await readdir(dir, { withFileTypes: true });

   const deletions = await pMap(
      entries,
      async (entry) => {
         const fullPath = join(dir, entry.name),
               stats = await stat(fullPath);

         if (stats.mtimeMs < cutoffTime) {
            const size = entry.isDirectory() ? await getDirectorySize(fullPath) : stats.size;

            await safeRm(fullPath, { force: true });
            return { path: fullPath, size };
         }
         return null;
      },
      { concurrency: 5 },
   );

   for (const deletion of deletions) {
      if (deletion) {
         result.deletedPaths.push(deletion.path);
         result.freedBytes += deletion.size;
      }
   }
}

async function getDirectorySize(dirPath: string): Promise<number> {
   const stats = await stat(dirPath);

   if (!stats.isDirectory()) {
      return stats.size;
   }

   const entries = await readdir(dirPath, { withFileTypes: true }),
         sizes = await pMap(entries, (entry) => getDirectorySize(join(dirPath, entry.name)), {
            concurrency: 5,
         });

   return sizes.reduce((sum, s) => sum + s, 0);
}
