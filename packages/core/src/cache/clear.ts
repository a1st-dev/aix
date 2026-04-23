import { safeRm } from '../fs/safe-rm.js';
import { join } from 'pathe';
import { getTmpDir } from './paths.js';
import { getCacheStatus } from './status.js';
import { getRuntimeAdapter } from '../runtime/index.js';

export interface ClearCacheResult {
   deletedPaths: string[];
   freedBytes: number;
}

/**
 * Clear all cache and temporary content from .aix/.tmp/ directory.
 * Also cleans up legacy directories (.aix/backups, .aix/cache, .aix/node_modules).
 */
export async function clearCache(projectRoot: string): Promise<ClearCacheResult> {
   const aixDir = join(projectRoot, '.aix'),
         result: ClearCacheResult = { deletedPaths: [], freedBytes: 0 };

   if (!getRuntimeAdapter().fs.existsSync(aixDir)) {
      return result;
   }

   // Get current size before deletion
   const status = await getCacheStatus(projectRoot);

   result.freedBytes = status.totalSize;

   // Delete entire .tmp directory (preserves skills/)
   const tmpDir = getTmpDir(projectRoot);

   if (getRuntimeAdapter().fs.existsSync(tmpDir)) {
      await safeRm(tmpDir, { force: true });
      result.deletedPaths.push(tmpDir);
   }

   // Legacy cleanup: remove old top-level directories if they exist
   const legacyDirs = ['backups', 'cache', 'node_modules'],
         legacyPaths = legacyDirs.map((dir) => join(aixDir, dir)).filter((path) => getRuntimeAdapter().fs.existsSync(path));

   await Promise.all(legacyPaths.map((path) => safeRm(path, { force: true })));
   result.deletedPaths.push(...legacyPaths);

   return result;
}
