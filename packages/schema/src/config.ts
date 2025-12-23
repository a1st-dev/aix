import { z } from 'zod';
import { configMetaSchema } from './core.js';
import { skillsSchema } from './skills.js';
import { mcpSchema } from './mcp.js';
import { rulesSchema } from './rules.js';
import { promptsSchema } from './prompts.js';
import { editorsSchema } from './editors.js';
import { hooksSchema } from './hooks.js';
import { aixSettingsSchema } from './aix.js';

export const aiJsonConfigSchema = configMetaSchema.extend({
   skills: skillsSchema.optional().default({}),
   mcp: mcpSchema.optional().default({}),
   rules: rulesSchema.optional().default({}),
   prompts: promptsSchema.optional().default({}),
   editors: editorsSchema.optional(),
   hooks: hooksSchema.optional().describe('Lifecycle hooks for AI agent events'),
   aix: aixSettingsSchema.optional().describe('aix CLI tool settings'),
});

export type AiJsonConfig = z.infer<typeof aiJsonConfigSchema>;

/**
 * Schema for ai.local.json - same as aiJsonConfigSchema but without extends.
 * Local config is a simple patch file, no inheritance chain allowed.
 */
export const localConfigSchema = z
   .object({
      $schema: z.string().url().optional().describe('URL to JSON Schema for validation'),
      skills: skillsSchema.optional(),
      mcp: mcpSchema.optional(),
      rules: rulesSchema.optional(),
      prompts: promptsSchema.optional(),
      editors: editorsSchema.optional(),
      hooks: hooksSchema.optional().describe('Lifecycle hooks for AI agent events'),
      aix: aixSettingsSchema.optional().describe('aix CLI tool settings'),
   })
   .strict()
   .refine((data) => !('extends' in data), { message: 'extends is not allowed in ai.local.json' });

export type LocalConfig = z.infer<typeof localConfigSchema>;
