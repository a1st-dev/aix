import type { AiJsonConfig, RulesConfig, PromptsConfig } from '@a1st/aix-schema';
import { deepMergeJson } from './json.js';

/**
 * Valid scopes for filtering config sections.
 */
export type ConfigScope = 'rules' | 'mcp' | 'skills' | 'editors' | 'prompts';

/**
 * Filter a config to only include the specified scopes.
 * @param config - Full config
 * @param scopes - Scopes to include (if empty, returns empty partial)
 * @returns Partial config with only specified sections
 */
export function filterConfigByScopes(
   config: AiJsonConfig,
   scopes: ConfigScope[],
): Partial<AiJsonConfig> {
   if (scopes.length === 0) {
      return {};
   }

   const result: Partial<AiJsonConfig> = {};

   for (const scope of scopes) {
      switch (scope) {
      case 'rules':
         if (config.rules) {
            result.rules = config.rules;
         }
         break;
      case 'prompts':
         if (config.prompts) {
            result.prompts = config.prompts;
         }
         break;
      case 'mcp':
         if (config.mcp) {
            result.mcp = config.mcp;
         }
         break;
      case 'skills':
         if (config.skills) {
            result.skills = config.skills;
         }
         break;
      case 'editors':
         if (config.editors) {
            result.editors = config.editors;
         }
         break;
      }
   }

   return result;
}

/**
 * Remove entries set to false from an object.
 */
function filterFalseValues<T extends Record<string, unknown>>(obj: T): T {
   const result = { ...obj };

   for (const key of Object.keys(result)) {
      if (result[key] === false) {
         delete result[key];
      }
   }
   return result as T;
}

/**
 * Merge two object configs with key-level replacement and false-value support.
 * - Keys are merged, but if same key exists in both, remote value replaces local entirely
 * - If remote has `false`, the key is removed (disables the entry)
 * - If local has `false` and remote has an object, the object wins (re-enables)
 * - Final result has all `false` values filtered out
 */
function mergeWithFalseSupport<T extends Record<string, unknown>>(
   local: T | undefined,
   remote: T | undefined,
): T {
   if (!remote) {
      return filterFalseValues((local ?? {}) as T);
   }
   if (!local) {
      return filterFalseValues(remote);
   }

   const merged = { ...local };

   for (const [key, remoteValue] of Object.entries(remote)) {
      if (remoteValue === false) {
         // Remote wants to disable - remove the entry
         delete merged[key];
      } else {
         // Remote has a value - it wins (including over local false)
         (merged as Record<string, unknown>)[key] = remoteValue;
      }
   }

   return filterFalseValues(merged) as T;
}

/**
 * Merge two AiJsonConfig objects. Remote config wins on conflicts.
 *
 * Merge strategy:
 * - `skills`: Object merge by key, replace entire value on key conflict
 * - `rules`: Object merge by key, replace entire value on key conflict
 * - `prompts`: Object merge by key, replace entire value on key conflict
 * - `mcp`: Object merge by key, replace entire value on key conflict
 * - `editors`: Object merge by key, deep merge on key conflict
 * - `$schema`, `extends`: Remote wins
 *
 * @param local - Existing local config
 * @param remote - Remote config to merge in (may be partial if scope-filtered)
 * @returns Merged config
 */
export function mergeConfigs(local: AiJsonConfig, remote: Partial<AiJsonConfig>): AiJsonConfig {
   // Start with local as base
   const result: AiJsonConfig = { ...local };

   // Merge skills (key-level replacement with false support)
   if (remote.skills !== undefined) {
      result.skills = mergeWithFalseSupport(
         local.skills as Record<string, unknown> | undefined,
         remote.skills as Record<string, unknown> | undefined,
      ) as AiJsonConfig['skills'];
   }

   // Merge rules (key-level replacement with false support)
   if (remote.rules !== undefined) {
      result.rules = mergeWithFalseSupport(
         local.rules as Record<string, unknown> | undefined,
         remote.rules as Record<string, unknown> | undefined,
      ) as RulesConfig;
   }

   // Merge prompts (key-level replacement with false support)
   if (remote.prompts !== undefined) {
      result.prompts = mergeWithFalseSupport(
         local.prompts as Record<string, unknown> | undefined,
         remote.prompts as Record<string, unknown> | undefined,
      ) as PromptsConfig;
   }

   // Merge mcp (with false support for disabling servers)
   if (remote.mcp !== undefined) {
      result.mcp = mergeWithFalseSupport(
         local.mcp as Record<string, unknown> | undefined,
         remote.mcp as Record<string, unknown> | undefined,
      ) as AiJsonConfig['mcp'];
   }

   // Merge editors (deep merge, remote wins on key conflict)
   if (remote.editors !== undefined) {
      // Handle both array and object forms - normalize to object for merging
      const localEditors = normalizeEditors(local.editors),
            remoteEditors = normalizeEditors(remote.editors);

      result.editors = deepMergeJson(
         localEditors as Record<string, unknown>,
         remoteEditors as Record<string, unknown>,
      ) as AiJsonConfig['editors'];
   }

   // Metadata fields: remote wins
   if (remote.$schema !== undefined) {
      result.$schema = remote.$schema;
   }
   if (remote.extends !== undefined) {
      result.extends = remote.extends;
   }

   return result;
}

/**
 * Normalize editors config to object form for merging.
 * Array form: ["windsurf", { "cursor": {...} }] → { windsurf: { enabled: true }, cursor: {...} }
 */
function normalizeEditors(editors: AiJsonConfig['editors']): Record<string, unknown> {
   if (!editors) {
      return {};
   }

   if (Array.isArray(editors)) {
      const result: Record<string, unknown> = {};

      for (const item of editors) {
         if (typeof item === 'string') {
            result[item] = { enabled: true };
         } else {
            Object.assign(result, item);
         }
      }
      return result;
   }

   return editors as Record<string, unknown>;
}
