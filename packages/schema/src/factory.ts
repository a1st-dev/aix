import type { AiJsonConfig } from './config.js';
import type { ConfigScope } from './core.js';

/**
 * Create an empty AiJsonConfig with all required fields initialized to their defaults.
 * This is the single source of truth for creating new configs.
 *
 * When `scope` is `"user"`, it is included in the returned object.
 * When omitted or `"project"` (the default), the scope field is omitted.
 */
export function createEmptyConfig(scope?: ConfigScope): AiJsonConfig {
   return {
      ...(scope === 'user' ? { scope } : {}),
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
   };
}

/**
 * Resolve the effective scope of a config, defaulting to "project" when unset.
 */
export function resolveScope(config: AiJsonConfig): ConfigScope {
   return config.scope ?? 'project';
}
