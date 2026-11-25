import type { AiJsonConfig } from './config.js';
import type { ConfigScope } from './core.js';

/**
 * Create an empty AiJsonConfig with all required fields initialized to their defaults.
 * This is the single source of truth for creating new configs.
 *
 * A `scope` is recorded only when one is given. A config without one installs to user
 * scope unless a scope flag says otherwise.
 */
export function createEmptyConfig(scope?: ConfigScope): AiJsonConfig {
   return {
      ...(scope ? { scope } : {}),
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
      agents: {},
      plugins: {},
      marketplaces: {},
   };
}
