import { z } from 'zod';
import { gitSourceSchema, npmSourceSchema } from './rules.js';

/**
 * Prompt object with metadata and content source.
 * Note: `name` is no longer needed in object form - it's the key in the parent object.
 */
export const promptObjectSchema = z
   .object({
      description: z.string().optional().describe('Shown in command picker'),
      argumentHint: z.string().optional().describe('Hint for arguments (e.g., "[file] [message]")'),
      content: z.string().optional().describe('Inline prompt content'),
      path: z.string().optional().describe('Local file path to prompt content'),
      git: gitSourceSchema.optional().describe('Git repository source'),
      npm: npmSourceSchema.optional().describe('NPM package source'),
   })
   .refine(
      (data) => {
         const sources = [data.content, data.path, data.git, data.npm].filter(Boolean);

         return sources.length === 1;
      },
      { message: 'Exactly one content source required: content, path, git, or npm' },
   )
   .describe('Prompt/command definition');

/**
 * String shorthand for source references.
 * - Local paths: "./prompts/review.md", "../shared/prompts.md", "/abs/path", "file:../foo"
 * - Git URLs: "https://...", "git+https://...", "github:user/repo", "user/repo#ref"
 */
const promptStringSchema = z
   .string()
   .describe(
      'Source reference: local path (./, ../, /, file:), git URL (https://), or git shorthand (github:)',
   );

/**
 * A prompt value can be:
 * - String: source reference (local path or git URL) - normalized at parse time
 * - Object: full prompt with content source and optional metadata
 */
export const promptValueSchema = z.union([promptStringSchema, promptObjectSchema]);

/**
 * Prompt name validation (key in the prompts object).
 */
export const promptNameSchema = z
   .string()
   .min(1)
   .max(64)
   .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Prompt name must be lowercase alphanumeric with single hyphens (e.g., "code-review")',
   )
   .describe('Prompt name (used as key and command name)');

/**
 * Prompts config - object keyed by prompt name.
 */
export const promptsSchema = z
   .record(promptNameSchema, z.union([promptValueSchema, z.literal(false)]))
   .describe('Map of prompt names to their definitions (or false to disable)');

export type PromptObject = z.infer<typeof promptObjectSchema>;
export type PromptValue = z.infer<typeof promptValueSchema>;
export type PromptsConfig = z.infer<typeof promptsSchema>;
