import { z } from 'zod';
import { sourceRefSchema } from './references.js';
import { editorEnum } from './editors.js';

export const pluginNameSchema = z
   .string()
   .min(1)
   .max(128)
   .regex(
      /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(@[a-z0-9_.-]+)?$/,
      'Plugin name must be a valid package name or plugin@marketplace identifier',
   )
   .describe('Plugin identifier (e.g., "code-review", "code-review@claude-plugins-official", "@scope/pkg")');

export const pluginObjectSchema = z
   .object({
      marketplace: z.string().optional().describe('Marketplace name where plugin is published'),
      source: sourceRefSchema.optional().describe('Direct source reference (path, git URL, npm package, or registry)'),
      enabled: z.boolean().optional().describe('Whether the plugin is active (default: true)'),
      options: z.record(z.unknown()).optional().describe('Plugin-specific configuration options'),
      editor: z
         .record(editorEnum, z.record(z.unknown()))
         .optional()
         .describe('Editor-specific plugin configuration fields'),
   })
   .describe('Plugin configuration object');

export const pluginValueSchema = z.union([
   z.boolean().describe('Boolean flag to enable or disable plugin'),
   z.string().describe('Source shorthand (path, git repo, or package name)'),
   pluginObjectSchema,
]);

export const pluginsSchema = z
   .record(pluginNameSchema, z.union([pluginValueSchema, z.literal(false)]))
   .describe('Map of plugin names or plugin@marketplace identifiers to their configuration');

export type PluginObject = z.infer<typeof pluginObjectSchema>;
export type PluginValue = z.infer<typeof pluginValueSchema>;
export type PluginsConfig = z.infer<typeof pluginsSchema>;
