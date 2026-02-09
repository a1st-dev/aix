/**
 * Safe git download utility with automatic cleanup.
 */
import { join } from 'pathe';
import { downloadTemplate } from 'giget';
import { safeRm } from './fs/safe-rm.js';
import { getGitDownloadsDir } from './cache/paths.js';

/**
 * Create a unique directory name from a git template string. Includes the ref to avoid collisions
 * between different branches/tags.
 *
 * @example "github:org/repo#main" → "org-repo-main-a1b2c3d4"
 */
export function createDownloadKey(template: string): string {
   // Parse template to extract components
   // Format: "provider:user/repo/path#ref" or "provider:user/repo#ref"
   const match = template.match(/^(?:github|gitlab|bitbucket):([^#]+)(?:#(.+))?$/);

   if (match) {
      const [, repoPath, ref = 'HEAD'] = match,
            safePath = repoPath!.replace(/\//g, '-'),
            hash = Buffer.from(template).toString('base64url').slice(0, 8);

      return `${safePath}-${ref}-${hash}`;
   }

   // Fallback for other formats (e.g., https URLs)
   return Buffer.from(template).toString('base64url').slice(0, 32);
}

/**
 * Download a git template, run an operation, then clean up. Always cleans up after use - no
 * persistent caching. This ensures the cache doesn't grow indefinitely and prevents stale data.
 *
 * @param template - Git template string (e.g., "github:org/repo#main")
 * @param projectRoot - Project root for determining temp directory location
 * @param operation - Async operation to run with the downloaded directory
 * @returns Result of the operation
 */
export async function withGitDownload<T>(
   template: string,
   projectRoot: string,
   operation: (dir: string) => Promise<T>,
): Promise<T> {
   const downloadKey = createDownloadKey(template),
         targetDir = join(getGitDownloadsDir(projectRoot), downloadKey);

   try {
      const { dir } = await downloadTemplate(template, {
         dir: targetDir,
         force: true,
         forceClean: true,
      });

      return await operation(dir);
   } finally {
      // Always clean up - no persistent cache
      await safeRm(targetDir, { force: true }).catch(() => {});
   }
}
