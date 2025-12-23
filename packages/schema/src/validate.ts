import { aiJsonConfigSchema, localConfigSchema, type AiJsonConfig } from './config.js';
import { type ZodError } from 'zod';

export interface ValidationResult {
   success: boolean;
   data?: AiJsonConfig;
   errors?: Array<{
      path: string;
      message: string;
   }>;
}

export function validateConfig(input: unknown): ValidationResult {
   try {
      const data = aiJsonConfigSchema.parse(input);

      return { success: true, data };
   } catch (error) {
      if (error instanceof Error && 'issues' in error) {
         const zodError = error as ZodError;

         return {
            success: false,
            errors: zodError.issues.map((issue) => ({
               path: issue.path.join('.'),
               message: issue.message,
            })),
         };
      }
      return {
         success: false,
         errors: [{ path: '', message: String(error) }],
      };
   }
}

export function parseConfig(input: unknown): AiJsonConfig {
   return aiJsonConfigSchema.parse(input);
}

/**
 * Parse and validate a local config (ai.local.json).
 * Local configs don't allow extends and return a partial config for merging.
 */
export function parseLocalConfig(input: unknown): Partial<AiJsonConfig> {
   return localConfigSchema.parse(input) as Partial<AiJsonConfig>;
}
