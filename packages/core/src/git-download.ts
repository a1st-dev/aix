/**
 * Safe git download utility with automatic cleanup.
 */
import { join } from 'pathe';
import { safeRm } from './fs/safe-rm.js';
import { getGitDownloadsDir } from './cache/paths.js';
import { getRuntimeAdapter } from './runtime/index.js';

const CACHE_KEY_HASH_LENGTH = 32,
      UNSAFE_PATH_SEGMENT_CHARS = /[^A-Za-z0-9._-]+/g;

/**
 * Create a directory-safe cache key that is distinct for every distinct list of parts. A
 * truncated encoding of the input is not enough: URLs on one host share a long prefix, so
 * the parts are hashed as a whole.
 */
export function createCacheKey(...parts: ReadonlyArray<string | undefined>): string {
   const hash = getRuntimeAdapter().crypto.createHash('sha256');

   // JSON keeps the part boundaries, so ('a', 'bc') and ('ab', 'c') hash differently.
   hash.update(JSON.stringify(parts));

   return hash.digest('hex').slice(0, CACHE_KEY_HASH_LENGTH);
}

/**
 * Create a unique directory name from a git template string. The readable prefix is only a
 * debugging aid; the hash of the whole template is what keeps two templates apart.
 *
 * @example "github:org/repo#main" -> "org-repo-main-<hash>"
 */
export function createDownloadKey(template: string): string {
   // Format: "provider:user/repo/path#ref" or "provider:user/repo#ref"
   const match = template.match(/^(?:github|gitlab|bitbucket):([^#]+)(?:#(.+))?$/),
         hash = createCacheKey(template);

   if (!match) {
      return hash;
   }

   const [, repoPath = '', ref = 'HEAD'] = match,
         label = `${repoPath}-${ref}`.replace(UNSAFE_PATH_SEGMENT_CHARS, '-');

   return `${label}-${hash}`;
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
      const { dir } = await getRuntimeAdapter().git.downloadTemplate(template, {
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
