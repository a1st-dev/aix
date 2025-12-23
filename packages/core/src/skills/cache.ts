import { mkdir } from 'node:fs/promises';
import { getNpmCacheDir } from '../cache/paths.js';
import { safeRm } from '../fs/safe-rm.js';

/**
 * Ensure the npm cache directory exists.
 */
export async function ensureNpmCacheDir(projectRoot: string): Promise<string> {
   const path = getNpmCacheDir(projectRoot);

   await mkdir(path, { recursive: true });
   return path;
}

/**
 * Clear the npm skills cache.
 * Note: Git skills cache is managed by giget and not cleared here.
 */
export async function clearNpmCache(projectRoot: string): Promise<void> {
   const cacheDir = getNpmCacheDir(projectRoot);

   await safeRm(cacheDir, { force: true });
}
