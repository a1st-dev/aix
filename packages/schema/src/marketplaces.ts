import { z } from 'zod';
import { gitRefSchema, localRefSchema } from './references.js';

export const marketplaceNameSchema = z
   .string()
   .min(1)
   .max(64)
   .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Marketplace name must be lowercase alphanumeric with single hyphens (e.g., "claude-plugins-official")',
   )
   .describe('Marketplace identifier');

export const marketplaceObjectSchema = z
   .object({
      source: z
         .union([
            z.string().describe('Git shorthand, HTTPS URL, or local path'),
            gitRefSchema,
            localRefSchema,
         ])
         .describe('Source location of the marketplace catalog'),
      enabled: z.boolean().optional().describe('Whether the marketplace is active (default: true)'),
      description: z.string().optional().describe('Optional description of the marketplace'),
   })
   .describe('Marketplace configuration object');

export const marketplaceValueSchema = z.union([
   z.string().describe('Marketplace source URL, git shorthand, or local directory path'),
   marketplaceObjectSchema,
]);

export const marketplacesSchema = z
   .record(marketplaceNameSchema, z.union([marketplaceValueSchema, z.literal(false)]))
   .describe('Map of marketplace names to their catalog locations (or false to disable)');

export type MarketplaceObject = z.infer<typeof marketplaceObjectSchema>;
export type MarketplaceValue = z.infer<typeof marketplaceValueSchema>;
export type MarketplacesConfig = z.infer<typeof marketplacesSchema>;
