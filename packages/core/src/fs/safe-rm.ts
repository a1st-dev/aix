import { relative, resolve, normalize, sep } from 'pathe';
import { getRuntimeAdapter } from '../runtime/index.js';
import type { RuntimeRemoveOptions } from '../runtime/index.js';
import { getGlobalCopilotDir } from '../editors/strategies/copilot/paths.js';

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

// pathe normalizes separators to forward slashes on every platform.
const BLOCKED_PATHS_WINDOWS = new Set([
   'c:',
   'c:/',
   'c:/windows',
   'c:/program files',
   'c:/program files (x86)',
   'c:/users',
   'c:/programdata',
]);

const DEFAULT_MAX_RETRIES = 5,
      DEFAULT_RETRY_DELAY_MS = 100;

/**
 * Check if a path is in the blocklist.
 */
function isBlockedPath(normalizedPath: string): boolean {
   const lower = normalizedPath.toLowerCase();

   if (getRuntimeAdapter().os.platform() === 'win32') {
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
   const tempDir = normalize(getRuntimeAdapter().os.tmpdir()),
         isWin = getRuntimeAdapter().os.platform() === 'win32';

   if (isWin) {
      const lowerPath = normalizedPath.toLowerCase(),
            lowerTemp = tempDir.toLowerCase();

      return lowerPath.startsWith(lowerTemp + sep) || lowerPath === lowerTemp;
   }

   return normalizedPath.startsWith(tempDir + sep) || normalizedPath === tempDir;
}

/**
 * Editor config locations aix installs into. The two-segment entries are user-scope
 * directories whose last segment is too common a name to trust on its own.
 */
const EDITOR_CONFIG_DIRS = [
   '.windsurf',
   '.codeium',
   '.cursor',
   '.claude',
   '.vscode',
   '.zed',
   '.codex',
   '.gemini',
   '.agents',
   '.antigravity',
   '.github',
   '.opencode',
   '.config/opencode',
   '.config/github-copilot',
   '.copilot',
   '.grok',
] as const;

/**
 * Whether the path lies strictly inside a directory with the given name. The directory itself
 * does not count: removing `~/.claude` or a project's `.aix` wholesale is never something aix
 * does, so a path that resolves to one is a bug in the caller.
 */
function isInsideDirNamed(normalizedPath: string, dirName: string): boolean {
   const isWin = getRuntimeAdapter().os.platform() === 'win32',
         path = isWin ? normalizedPath.toLowerCase() : normalizedPath;

   return path.includes(`${sep}${dirName}${sep}`);
}

function isInAixDir(normalizedPath: string): boolean {
   return isInsideDirNamed(normalizedPath, '.aix');
}

function isInCopilotCustomizationDir(normalizedPath: string): boolean {
   const home = getRuntimeAdapter().os.homedir(),
         path = relative(resolve(home, getGlobalCopilotDir()), normalizedPath),
         [section, name, ...rest] = path.split(sep);

   return name !== undefined && rest.length === 0
      && (section === 'skills' || section === 'agents' || section === 'instructions');
}

function isInEditorConfigDir(normalizedPath: string): boolean {
   return EDITOR_CONFIG_DIRS.some((dir) => {
      return isInsideDirNamed(normalizedPath, dir);
   });
}

/**
 * Check if path is within a test-fixtures directory (for test cleanup).
 */
function isInTestFixturesDir(normalizedPath: string): boolean {
   const isWin = getRuntimeAdapter().os.platform() === 'win32',
         p = isWin ? normalizedPath.toLowerCase() : normalizedPath;

   return (
      p.includes(`${sep}test-fixtures${sep}`) || p.endsWith(`${sep}test-fixtures`)
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
   options: RuntimeRemoveOptions = {},
): Promise<void> {
   const resolved = resolve(targetPath),
         normalized = normalize(resolved),
         home = normalize(getRuntimeAdapter().os.homedir());

   // Check blocklist
   if (isBlockedPath(normalized)) {
      throw new UnsafePathError(normalized, 'path is a protected system directory');
   }

   // Check home directory
   if (normalized === home) {
      throw new UnsafePathError(normalized, 'path is the home directory');
   }

   // Validate path is in an allowed location
   const isAllowed =
      isInTempDir(normalized) ||
      isInAixDir(normalized) ||
      isInEditorConfigDir(normalized) ||
      isInCopilotCustomizationDir(normalized) ||
      isInTestFixturesDir(normalized);

   if (!isAllowed) {
      throw new UnsafePathError(
         normalized,
         'path is not within temp directory, .aix directory, editor config directory, or test-fixtures directory',
      );
   }

   // Check minimum depth (skip for temp directories which are already validated as safe)
   if (!isInTempDir(normalized) && !hasMinimumDepth(normalized)) {
      throw new UnsafePathError(normalized, 'path is too shallow (minimum 3 segments required)');
   }

   await getRuntimeAdapter().fs.rm(resolved, {
      recursive: true,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
      ...options,
   });
}
