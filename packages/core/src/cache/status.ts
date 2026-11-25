import { join } from 'pathe';
import { getCacheDir, getNpmCacheDir } from './paths.js';
import { getRuntimeAdapter } from '../runtime/index.js';

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
   gitCache: CacheCategory;
   npmCache: CacheCategory;
}

/**
 * Get the current cache status for a project.
 */
export async function getCacheStatus(projectRoot: string): Promise<CacheStatus> {
   // Check both new (.tmp/) and legacy paths
   const [gitCache, npmCache, legacyGitCache, legacyNpmCache] = await Promise.all([
            scanDirectory(getCacheDir(projectRoot)),
            scanDirectory(getNpmCacheDir(projectRoot)),
            scanDirectory(join(projectRoot, '.aix', 'cache')),
            scanDirectory(join(projectRoot, '.aix', 'node_modules')),
         ]),
         mergedGitCache = mergeCategories(gitCache, legacyGitCache),
         mergedNpmCache = mergeCategories(npmCache, legacyNpmCache);

   return {
      totalSize: mergedGitCache.size + mergedNpmCache.size,
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
   if (!getRuntimeAdapter().fs.existsSync(dir)) {
      return { size: 0, count: 0, entries: [] };
   }

   const entries: CacheEntry[] = [];
   let totalSize = 0;

   async function scan(currentDir: string): Promise<void> {
      const items = await getRuntimeAdapter().fs.readdir(currentDir, { withFileTypes: true });

      // Sequential scan is required to accumulate totalSize correctly
      for (const item of items) {
         const fullPath = join(currentDir, item.name);

         if (item.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop -- Recursive directory traversal
            await scan(fullPath);
         } else {
            // eslint-disable-next-line no-await-in-loop -- Sequential accumulation of totalSize
            const stats = await getRuntimeAdapter().fs.stat(fullPath);

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
