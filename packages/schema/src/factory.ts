import type { AiJsonConfig } from './config.js';

/**
 * Create an empty AiJsonConfig with all required fields initialized to their defaults.
 * This is the single source of truth for creating new configs.
 */
export function createEmptyConfig(): AiJsonConfig {
   return {
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
   };
}
