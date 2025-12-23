import type { AiJsonConfig } from './config.js';

/**
 * Prefixes that indicate a local file path reference.
 */
const LOCAL_PATH_PREFIXES = ['./', '../', '/', 'file:'];

/**
 * Detect if a string is a local path reference.
 */
export function isLocalPath(value: string): boolean {
   return LOCAL_PATH_PREFIXES.some((p) => value.startsWith(p));
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
