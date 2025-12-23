export type LocalRef = { type: 'local'; path: string };
export type GitRef = { type: 'git'; url: string; ref?: string; path?: string };
export type NpmRef = {
   type: 'npm';
   packageName: string;
   path?: string; // subpath within package
   version?: string; // if present, auto-install; if absent, use node_modules
};
export type SkillRef = LocalRef | GitRef | NpmRef;

/**
 * Check if a string looks like an npm package name (without subpath).
 * Matches: aix-skill-*, @scope/aix-skill-*, or any scoped/unscoped package
 */
function isNpmPackageName(str: string): boolean {
   // Scoped package: @scope/package (exactly two parts)
   if (str.startsWith('@')) {
      const parts = str.split('/');

      return parts.length === 2;
   }
   // aix-skill- prefix (our convention)
   if (str.startsWith('aix-skill-')) {
      return true;
   }
   // Any other package name (no path separators, no git prefixes)
   return !str.includes('/') && !str.includes(':') && !str.startsWith('.');
}

/**
 * Parse npm package reference with optional subpath.
 * Requires file extension to distinguish from plain package names.
 *
 * Examples:
 * - "@scope/pkg/rules/style.md" → { packageName: "@scope/pkg", path: "rules/style.md" }
 * - "pkg/prompts/review.md" → { packageName: "pkg", path: "prompts/review.md" }
 * - "@scope/pkg" → { packageName: "@scope/pkg" } (no subpath)
 */
function parseNpmWithSubpath(str: string): { packageName: string; path?: string } | undefined {
   // Must have a file extension to be treated as having a subpath
   const hasExtension = /\.[a-z0-9]+$/i.test(str);

   if (str.startsWith('@')) {
      // Scoped: @scope/package or @scope/package/subpath
      const parts = str.split('/');

      if (parts.length < 2) {
         return undefined;
      }

      const packageName = `${parts[0]}/${parts[1]}`;

      if (parts.length === 2) {
         return { packageName };
      }
      // Has subpath - only valid if has extension
      if (!hasExtension) {
         return undefined;
      }
      return { packageName, path: parts.slice(2).join('/') };
   }

   // Unscoped: package or package/subpath
   const slashIdx = str.indexOf('/');

   if (slashIdx === -1) {
      return { packageName: str };
   }
   // Has subpath - only valid if has extension
   if (!hasExtension) {
      return undefined;
   }
   return {
      packageName: str.slice(0, slashIdx),
      path: str.slice(slashIdx + 1),
   };
}

/**
 * Parse git shorthand format: github:user/repo/path#ref or github:user/repo#ref:path
 * Supported providers: github, gitlab
 *
 * Two path formats are supported:
 * 1. Path in repo portion: github:user/repo/subdir/path#ref
 * 2. Path after ref: github:user/repo#ref:subdir/path
 */
function parseGitShorthand(input: string): GitRef | undefined {
   // Match: github:user/repo or gitlab:user/repo with optional /path and #ref
   const match = input.match(/^(github|gitlab):([^#]+)(?:#(.+))?$/);

   if (!match) {
      return undefined;
   }

   const [, provider, repoPath, refAndPath] = match;

   // Split repo path: user/repo/optional/subpath
   const parts = repoPath?.split('/') ?? [];

   if (parts.length < 2) {
      return undefined;
   }

   const user = parts[0],
         repo = parts[1],
         subpathFromRepo = parts.length > 2 ? parts.slice(2).join('/') : undefined;

   // Parse ref and path - supports both #ref and #ref:path formats
   let ref: string | undefined, subpathFromRef: string | undefined;

   if (refAndPath) {
      const colonIdx = refAndPath.indexOf(':');

      if (colonIdx !== -1) {
         // Format: #ref:path
         ref = refAndPath.slice(0, colonIdx);
         subpathFromRef = refAndPath.slice(colonIdx + 1);
      } else {
         // Format: #ref (no path)
         ref = refAndPath;
      }
   }

   // Use path from ref portion if present, otherwise from repo portion
   const path = subpathFromRef ?? subpathFromRepo;

   return {
      type: 'git',
      url: `https://${provider}.com/${user}/${repo}`,
      ref,
      path,
   };
}

/**
 * Parse a skill reference into a structured object.
 * Supports local paths, git shorthand, git objects, and npm package names.
 */
export function parseSkillRef(name: string, input: unknown): SkillRef {
   // Handle false/disabled skills
   if (input === false) {
      throw new Error(`Skill "${name}" is disabled`);
   }

   if (typeof input === 'string') {
      // Local path
      if (input.startsWith('./') || input.startsWith('/') || input.startsWith('../')) {
         return { type: 'local', path: input };
      }
      // Git shorthand (github:user/repo, gitlab:user/repo)
      const gitRef = parseGitShorthand(input);

      if (gitRef) {
         return gitRef;
      }
      // NPM package (possibly with subpath)
      const npmParsed = parseNpmWithSubpath(input);

      if (
         npmParsed &&
         (isNpmPackageName(npmParsed.packageName) || npmParsed.packageName.startsWith('@'))
      ) {
         return { type: 'npm', ...npmParsed };
      }
      throw new Error(`Cannot determine skill reference type for "${name}": ${input}`);
   }

   if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;

      // Check git first (git objects may also have a path property for subdirectory)
      if ('git' in obj && typeof obj.git === 'string') {
         return {
            type: 'git',
            url: obj.git,
            ref: typeof obj.ref === 'string' ? obj.ref : undefined,
            path: typeof obj.path === 'string' ? obj.path : undefined,
         };
      }

      // NPM package (check before path since npm objects may also have a path property)
      if ('npm' in obj && typeof obj.npm === 'string') {
         return {
            type: 'npm',
            packageName: obj.npm,
            path: typeof obj.path === 'string' ? obj.path : undefined,
            version: typeof obj.version === 'string' ? obj.version : undefined,
         };
      }

      // Local path (only if no git or npm property)
      if ('path' in obj && typeof obj.path === 'string') {
         return { type: 'local', path: obj.path };
      }

      // Handle source wrapper object
      if ('source' in obj) {
         return parseSkillRef(name, obj.source);
      }
   }

   throw new Error(`Invalid skill reference for "${name}": ${JSON.stringify(input)}`);
}
