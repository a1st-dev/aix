import { rm } from 'node:fs/promises';
import { homedir, tmpdir, platform } from 'node:os';
import { resolve, normalize, sep } from 'pathe';

/**
 * Error thrown when attempting to remove a protected path.
 */
export class UnsafePathError extends Error {
   constructor(
      public readonly path: string,
      public readonly reason: string,
   ) {
      super(`Refusing to remove "${path}": ${reason}`);
      this.name = 'UnsafePathError';
   }
}

// Paths that should never be deleted (normalized, lowercase for case-insensitive comparison)
const BLOCKED_PATHS_UNIX = new Set([
   '/',
   '/bin',
   '/boot',
   '/dev',
   '/etc',
   '/home',
   '/lib',
   '/lib64',
   '/opt',
   '/proc',
   '/root',
   '/run',
   '/sbin',
   '/srv',
   '/sys',
   '/tmp',
   '/usr',
   '/var',
]);

const BLOCKED_PATHS_WINDOWS = new Set([
   'c:',
   'c:\\',
   'c:\\windows',
   'c:\\program files',
   'c:\\program files (x86)',
   'c:\\users',
   'c:\\programdata',
]);

/**
 * Check if a path is in the blocklist.
 */
function isBlockedPath(normalizedPath: string): boolean {
   const lower = normalizedPath.toLowerCase();

   if (platform() === 'win32') {
      return BLOCKED_PATHS_WINDOWS.has(lower);
   }
   return BLOCKED_PATHS_UNIX.has(lower);
}

/**
 * Check if path has sufficient depth (at least 3 segments).
 * Examples:
 * - "/" -> 1 segment (blocked)
 * - "/foo" -> 2 segments (blocked)
 * - "/foo/bar" -> 3 segments (allowed)
 * - "C:\foo" -> 2 segments (blocked)
 * - "C:\foo\bar" -> 3 segments (allowed)
 */
function hasMinimumDepth(normalizedPath: string, minDepth: number = 3): boolean {
   const segments = normalizedPath.split(sep).filter(Boolean);

   // On Windows, "C:" counts as a segment
   return segments.length >= minDepth;
}

/**
 * Check if path is within the system temp directory.
 */
function isInTempDir(normalizedPath: string): boolean {
   const tempDir = normalize(tmpdir());

   return normalizedPath.startsWith(tempDir + sep) || normalizedPath === tempDir;
}

/**
 * Check if path is within a .aix directory.
 */
function isInAixDir(normalizedPath: string): boolean {
   return normalizedPath.includes(`${sep}.aix${sep}`) || normalizedPath.endsWith(`${sep}.aix`);
}

/**
 * Check if path is within an editor config directory.
 */
function isInEditorConfigDir(normalizedPath: string): boolean {
   const editorDirs = ['.windsurf', '.cursor', '.claude', '.vscode', '.zed', '.codex'];

   return editorDirs.some(
      (dir) => normalizedPath.includes(`${sep}${dir}${sep}`) || normalizedPath.endsWith(`${sep}${dir}`),
   );
}

/**
 * Check if path is within a test-fixtures directory (for test cleanup).
 */
function isInTestFixturesDir(normalizedPath: string): boolean {
   return (
      normalizedPath.includes(`${sep}test-fixtures${sep}`) || normalizedPath.endsWith(`${sep}test-fixtures`)
   );
}

/**
 * Safely remove a directory recursively, with validation to prevent accidental deletion
 * of critical system or project directories.
 *
 * @param targetPath - The path to remove
 * @param options - Options passed to fs.rm (force is commonly used)
 * @throws UnsafePathError if the path is protected
 */
export async function safeRm(
   targetPath: string,
   options: { force?: boolean } = {},
): Promise<void> {
   const resolved = resolve(targetPath),
         normalized = normalize(resolved),
         home = normalize(homedir());

   // Check blocklist
   if (isBlockedPath(normalized)) {
      throw new UnsafePathError(normalized, 'path is a protected system directory');
   }

   // Check home directory
   if (normalized === home) {
      throw new UnsafePathError(normalized, 'path is the home directory');
   }

   // Check minimum depth
   if (!hasMinimumDepth(normalized)) {
      throw new UnsafePathError(normalized, 'path is too shallow (minimum 3 segments required)');
   }

   // Validate path is in an allowed location
   const isAllowed =
      isInTempDir(normalized) ||
      isInAixDir(normalized) ||
      isInEditorConfigDir(normalized) ||
      isInTestFixturesDir(normalized);

   if (!isAllowed) {
      throw new UnsafePathError(
         normalized,
         'path is not within temp directory, .aix directory, editor config directory, or test-fixtures directory',
      );
   }

   await rm(resolved, { recursive: true, ...options });
}
