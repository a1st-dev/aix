import { z } from 'zod';
import { sourceRefSchema } from './references.js';

export const skillNameSchema = z
   .string()
   .min(1)
   .max(64)
   .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Skill name must be lowercase alphanumeric with single hyphens (e.g., "pdf-processing")',
   )
   .describe('Skill name (Agent Skills spec compliant)');

export const skillConfigSchema = z.object({
   enabled: z.boolean().default(true).describe('Whether skill is active'),
   config: z.record(z.unknown()).optional().describe('Skill-specific configuration passed to SKILL.md'),
});

export const skillRefSchema = z
   .union([
      sourceRefSchema,
      z.object({
         source: sourceRefSchema.describe('Where to load the skill from'),
         enabled: z.boolean().default(true).describe('Whether skill is active'),
         config: z.record(z.unknown()).optional().describe('Skill-specific configuration'),
      }),
   ])
   .describe('Skill reference (Agent Skills spec compliant)');

export const skillsSchema = z
   .record(skillNameSchema, z.union([skillRefSchema, z.literal(false)]))
   .describe('Map of skill names to their configurations (or false to disable)');
