import { readdir, stat } from 'node:fs/promises';
import { join } from 'pathe';
import { existsSync } from 'node:fs';
import { getBackupsDir, getCacheDir, getNpmCacheDir } from './paths.js';

export interface CacheEntry {
   path: string;
   size: number;
   modifiedAt: Date;
}

export interface CacheCategory {
   size: number;
   count: number;
   entries: CacheEntry[];
}

export interface CacheStatus {
   totalSize: number;
   backups: CacheCategory;
   gitCache: CacheCategory;
   npmCache: CacheCategory;
}

/**
 * Get the current cache status for a project.
 */
export async function getCacheStatus(projectRoot: string): Promise<CacheStatus> {
   // Check both new (.tmp/) and legacy paths
   const [backups, gitCache, npmCache] = await Promise.all([
      scanDirectory(getBackupsDir(projectRoot)),
      scanDirectory(getCacheDir(projectRoot)),
      scanDirectory(getNpmCacheDir(projectRoot)),
   ]);

   // Also check legacy paths (for migration)
   const [legacyBackups, legacyGitCache, legacyNpmCache] = await Promise.all([
      scanDirectory(join(projectRoot, '.aix', 'backups')),
      scanDirectory(join(projectRoot, '.aix', 'cache')),
      scanDirectory(join(projectRoot, '.aix', 'node_modules')),
   ]);

   // Merge new and legacy results
   const mergedBackups = mergeCategories(backups, legacyBackups),
         mergedGitCache = mergeCategories(gitCache, legacyGitCache),
         mergedNpmCache = mergeCategories(npmCache, legacyNpmCache);

   return {
      totalSize: mergedBackups.size + mergedGitCache.size + mergedNpmCache.size,
      backups: mergedBackups,
      gitCache: mergedGitCache,
      npmCache: mergedNpmCache,
   };
}

function mergeCategories(a: CacheCategory, b: CacheCategory): CacheCategory {
   return {
      size: a.size + b.size,
      count: a.count + b.count,
      entries: [...a.entries, ...b.entries],
   };
}

async function scanDirectory(dir: string): Promise<CacheCategory> {
   if (!existsSync(dir)) {
      return { size: 0, count: 0, entries: [] };
   }

   const entries: CacheEntry[] = [];
   let totalSize = 0;

   async function scan(currentDir: string): Promise<void> {
      const items = await readdir(currentDir, { withFileTypes: true });

      // Sequential scan is required to accumulate totalSize correctly
      for (const item of items) {
         const fullPath = join(currentDir, item.name);

         if (item.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop -- Recursive directory traversal
            await scan(fullPath);
         } else {
            // eslint-disable-next-line no-await-in-loop -- Sequential accumulation of totalSize
            const stats = await stat(fullPath);

            totalSize += stats.size;
            entries.push({
               path: fullPath,
               size: stats.size,
               modifiedAt: stats.mtime,
            });
         }
      }
   }

   await scan(dir);
   return { size: totalSize, count: entries.length, entries };
}
