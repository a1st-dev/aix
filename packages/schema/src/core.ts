import { z } from 'zod';
import { validateStrict, satisfies } from 'compare-versions';
import { SCHEMA_BASE_URL } from './version.js';

export const semverSchema = z
   .string()
   .refine((v) => validateStrict(v), {
      message: 'Invalid semver version. Must be X.Y.Z format (e.g., "1.0.0")',
   })
   .describe('Semantic version (e.g., "1.0.0", "2.1.0-beta.1")');

export const semverRangeSchema = z
   .string()
   .refine(
      (range) => {
         try {
            satisfies('1.0.0', range);
            return true;
         } catch {
            return false;
         }
      },
      { message: 'Invalid semver range (e.g., "^1.0.0", "~2.1.0", ">=1.0.0 <2.0.0")' },
   )
   .describe('Semver range (e.g., "^1.0.0", "~2.1.0", ">=1.0.0 <2.0.0")');

export const extendsSchema = z
   .union([
      z.string().describe('Single config to extend (npm package or local path)'),
      z.array(z.string()).describe('Array of configs to extend (resolved in order)'),
   ])
   .optional()
   .describe('Extend from other ai.json configs');

export const configMetaSchema = z.object({
   $schema: z.string().url().optional().describe('URL to JSON Schema for validation'),
   extends: extendsSchema,
});

export { SCHEMA_BASE_URL };
