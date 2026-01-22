import type { AiJsonConfig } from './config.js';

/**
 * File extensions that indicate a local file (for implicit relative paths).
 */
const LOCAL_FILE_EXTENSIONS = /\.(md|txt|json|ya?ml|prompt\.md)$/i;

/**
 * Source types for config and asset references. This is the single source of truth for determining
 * what kind of source a string represents.
 */
export type SourceType =
   /** Local file path (./file, ../file, /absolute, or implicit like prompts/file.md) */
   | 'local'
   /** Git shorthand (github:org/repo, gitlab:org/repo, bitbucket:org/repo) */
   | 'git-shorthand'
   /** HTTPS URL pointing to a file (blob URL or direct .json file) */
   | 'https-file'
   /** HTTPS URL pointing to a repository root */
   | 'https-repo'
   /** Unsupported HTTP URL (non-HTTPS) */
   | 'http-unsupported'
   /** npm package reference */
   | 'npm';

/**
 * Detect the source type of a string. This is the single source of truth for source type detection
 * and should be used everywhere instead of ad-hoc checks.
 *
 * Detection order (first match wins):
 * 1. Git shorthand (github:, gitlab:, bitbucket:)
 * 2. HTTPS URLs (file vs repo)
 * 3. HTTP URLs (unsupported)
 * 4. Local paths (explicit prefixes or file extensions)
 * 5. npm packages (fallback)
 */
export function detectSourceType(source: string): SourceType {
   // Git shorthand: github:org/repo, gitlab:org/repo, bitbucket:org/repo
   if (/^(github|gitlab|bitbucket):/.test(source)) {
      return 'git-shorthand';
   }

   // HTTPS URL
   if (source.startsWith('https://')) {
      return isHttpsFileUrl(source) ? 'https-file' : 'https-repo';
   }

   // HTTP URL (reject for security)
   if (source.startsWith('http://')) {
      return 'http-unsupported';
   }

   // Local path detection
   if (isLocalPath(source)) {
      return 'local';
   }

   // Everything else is npm
   return 'npm';
}

/**
 * Check if an HTTPS URL points directly to a file (blob URL or direct file URL).
 */
function isHttpsFileUrl(url: string): boolean {
   // GitHub blob URL: https://github.com/org/repo/blob/ref/path
   if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//.test(url)) {
      return true;
   }
   // GitLab blob URL: https://gitlab.com/group/project/-/blob/ref/path
   if (/^https:\/\/gitlab\.com\/[^/]+\/[^/]+\/-\/blob\//.test(url)) {
      return true;
   }
   // Bitbucket src URL: https://bitbucket.org/workspace/repo/src/ref/path
   if (/^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/src\//.test(url)) {
      return true;
   }
   // Direct file URL (ending in .json)
   if (url.endsWith('.json')) {
      return true;
   }
   return false;
}

/**
 * Detect if a string is a local path reference. Recognizes:
 * - Explicit relative paths: `./file`, `../file`
 * - Absolute paths: `/path/to/file`
 * - file: protocol: `file:../foo/bar.md`
 * - Implicit relative paths with file extensions: `prompts/file.md`, `file.txt`
 *
 * Excludes URLs and git shorthands even if they have matching extensions.
 */
export function isLocalPath(value: string): boolean {
   // Explicit relative or absolute paths (including file: protocol)
   if (
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('/') ||
      value.startsWith('file:')
   ) {
      return true;
   }

   // Exclude URLs and git shorthand
   if (value.includes('://') || /^(github|gitlab|bitbucket):/.test(value)) {
      return false;
   }

   // Implicit relative path with file extension (e.g., "prompts/add-skill.md")
   return LOCAL_FILE_EXTENSIONS.test(value);
}

/**
 * Parse npm package reference with optional subpath from a string.
 * Requires file extension to distinguish from plain package names.
 *
 * Examples:
 * - "@scope/pkg/rules/style.md" → { npm: "@scope/pkg", path: "rules/style.md" }
 * - "pkg/prompts/review.md" → { npm: "pkg", path: "prompts/review.md" }
 * - "@scope/pkg" → undefined (no subpath with extension)
 */
function parseNpmRef(str: string): { npm: string; path: string } | undefined {
   // Must have a file extension to be treated as npm with subpath
   const hasExtension = /\.[a-z0-9]+$/i.test(str);

   if (!hasExtension) {
      return undefined;
   }

   // Don't match git shorthands or URLs
   if (str.includes(':')) {
      return undefined;
   }

   if (str.startsWith('@')) {
      // Scoped: @scope/package/subpath
      const parts = str.split('/');

      if (parts.length < 3) {
         return undefined;
      } // Need at least @scope/pkg/file.ext

      return {
         npm: `${parts[0]}/${parts[1]}`,
         path: parts.slice(2).join('/'),
      };
   }

   // Unscoped: package/subpath
   const slashIdx = str.indexOf('/');

   if (slashIdx === -1) {
      return undefined;
   } // No subpath

   return {
      npm: str.slice(0, slashIdx),
      path: str.slice(slashIdx + 1),
   };
}

/**
 * Normalize a source reference string to its object form.
 * - Local paths (./,  ../,  /,  file:) → { path: "..." }
 * - NPM with subpath (pkg/path/file.md) → { npm: { npm: "pkg", path: "path/file.md" } }
 * - Everything else (URLs, git shorthands) → { git: { url: "..." } }
 */
export function normalizeSourceRef(value: string | Record<string, unknown>): Record<string, unknown> {
   if (typeof value !== 'string') {
      return value;
   }

   if (isLocalPath(value)) {
      // Strip file: prefix if present
      const path = value.startsWith('file:') ? value.slice(5) : value;

      return { path };
   }

   // Check for npm with subpath (has file extension)
   const npmParsed = parseNpmRef(value);

   if (npmParsed) {
      return { npm: npmParsed };
   }

   // Everything else is a git/URL reference
   return { git: { url: value } };
}

/**
 * Normalize a rules config object, expanding string shorthands.
 */
export function normalizeRulesConfig(
   rules: Record<string, string | Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
   const result: Record<string, Record<string, unknown>> = {};

   for (const [name, value] of Object.entries(rules)) {
      result[name] = normalizeSourceRef(value);
   }
   return result;
}

/**
 * Normalize a prompts config object, expanding string shorthands.
 */
export function normalizePromptsConfig(
   prompts: Record<string, string | Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
   const result: Record<string, Record<string, unknown>> = {};

   for (const [name, value] of Object.entries(prompts)) {
      result[name] = normalizeSourceRef(value);
   }
   return result;
}

/**
 * Normalize editors from array shorthand to object form.
 * - String items: "windsurf" → { windsurf: { enabled: true } }
 * - Object items: { "cursor": {...} } → merged with enabled: true
 * - Unlisted editors are implicitly disabled.
 */
export function normalizeEditors(
   editors: string[] | Array<string | Record<string, unknown>> | Record<string, unknown>,
): Record<string, { enabled: boolean; [key: string]: unknown }> {
   if (!Array.isArray(editors)) {
      return editors as Record<string, { enabled: boolean }>;
   }

   const result: Record<string, { enabled: boolean; [key: string]: unknown }> = {};

   for (const item of editors) {
      if (typeof item === 'string') {
         result[item] = { enabled: true };
      } else {
         // Object entry: { "cursor": { aiSettings: {...} } }
         for (const [name, config] of Object.entries(item)) {
            result[name] = { enabled: true, ...(config as Record<string, unknown>) };
         }
      }
   }

   return result;
}

/**
 * Normalize entire ai.json config, expanding all shorthands to their verbose forms.
 * This should be called after schema validation but before internal processing.
 */
export function normalizeConfig(config: unknown): AiJsonConfig {
   if (typeof config !== 'object' || config === null) {
      return config as AiJsonConfig;
   }

   const normalized = { ...config } as Record<string, unknown>;

   // Normalize editors
   if (normalized.editors) {
      normalized.editors = normalizeEditors(
         normalized.editors as Parameters<typeof normalizeEditors>[0],
      );
   }

   // Normalize rules (object format)
   if (normalized.rules && typeof normalized.rules === 'object' && !Array.isArray(normalized.rules)) {
      normalized.rules = normalizeRulesConfig(
         normalized.rules as Record<string, string | Record<string, unknown>>,
      );
   }

   // Normalize prompts (object format)
   if (
      normalized.prompts &&
      typeof normalized.prompts === 'object' &&
      !Array.isArray(normalized.prompts)
   ) {
      normalized.prompts = normalizePromptsConfig(
         normalized.prompts as Record<string, string | Record<string, unknown>>,
      );
   }

   return normalized as AiJsonConfig;
}
