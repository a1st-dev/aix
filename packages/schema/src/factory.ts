import type { AiJsonConfig } from './config.js';
import { SCHEMA_VERSION, SCHEMA_BASE_URL } from './version.js';

/**
 * Create an empty AiJsonConfig with all required fields initialized to their defaults.
 * This is the single source of truth for creating new configs.
 */
export function createEmptyConfig(): AiJsonConfig {
   return {
      $schema: `${SCHEMA_BASE_URL}/v${SCHEMA_VERSION}/ai.json`,
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
   };
}
