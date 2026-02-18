import { z } from 'zod';
import { rulesSchema } from './rules.js';

const baseEditorConfigSchema = z.object({
   enabled: z.boolean().default(true).describe('Whether to configure this editor'),
   rules: rulesSchema.optional().describe('Editor-specific rules (in addition to global rules)'),
});

export const windsurfConfigSchema = baseEditorConfigSchema.extend({
   cascadeSettings: z.record(z.unknown()).optional().describe('Windsurf Cascade settings'),
});

export const cursorConfigSchema = baseEditorConfigSchema.extend({
   aiSettings: z.record(z.unknown()).optional().describe('Cursor AI settings'),
});

export const claudeCodeConfigSchema = baseEditorConfigSchema.extend({
   permissions: z.record(z.unknown()).optional().describe('Claude Code permissions'),
});

export const editorEnum = z
   .enum(['windsurf', 'cursor', 'claude-code', 'copilot', 'zed', 'neovim'])
   .describe('Supported editor/agent');

/**
 * Verbose object form for editors configuration.
 * Each key is an editor name, value is its config.
 */
const editorsObjectSchema = z
   .object({
      windsurf: windsurfConfigSchema.optional(),
      cursor: cursorConfigSchema.optional(),
      'claude-code': claudeCodeConfigSchema.optional(),
   })
   .catchall(baseEditorConfigSchema);

/**
 * Array shorthand item: either an editor name string or { editorName: config } object.
 * - String: "windsurf" → { windsurf: { enabled: true } }
 * - Object: { "cursor": { "aiSettings": {...} } } → merged as-is
 */
const editorsArrayItemSchema = z.union([editorEnum, z.record(z.string(), baseEditorConfigSchema)]);

/**
 * Array shorthand form for editors.
 * Unlisted editors are implicitly disabled.
 * Example: ["windsurf", { "cursor": { "aiSettings": {} } }]
 */
const editorsArraySchema = z
   .array(editorsArrayItemSchema)
   .describe('Shorthand: array of editor names or configs');

/**
 * Editors configuration - accepts either:
 * - Array shorthand: ["windsurf", "cursor"] or ["windsurf", { "cursor": {...} }]
 * - Object form: { "windsurf": { "enabled": true }, "cursor": {...} }
 */
export const editorsSchema = z
   .union([editorsArraySchema, editorsObjectSchema])
   .describe('Editor-specific configurations');
