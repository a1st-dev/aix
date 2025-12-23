import { z } from 'zod';

export const activationModeSchema = z
   .enum(['always', 'auto', 'glob', 'manual'])
   .default('always')
   .describe('When the rule should be activated');

export const gitSourceSchema = z
   .object({
      url: z.string().describe('Git repository URL or shorthand (e.g., github:user/repo)'),
      path: z.string().optional().describe('Path to rule file within repo (default: root)'),
      ref: z.string().optional().describe('Branch, tag, or commit (default: main/master)'),
   })
   .describe('Git repository source');

export const npmSourceSchema = z
   .object({
      npm: z.string().describe('NPM package name (e.g., "@company/rules")'),
      path: z.string().describe('Path to file within package (e.g., "rules/style.md")'),
      version: z
         .string()
         .optional()
         .describe('Version to auto-install (omit to use project node_modules)'),
   })
   .describe('NPM package source');

/**
 * Rule object with metadata and content source.
 * Note: `name` is no longer needed in object form - it's the key in the parent object.
 */
export const ruleObjectSchema = z
   .object({
      description: z.string().optional().describe('When the rule should apply (required for auto mode)'),
      activation: activationModeSchema.optional(),
      globs: z.array(z.string()).optional().describe('File patterns (required for glob mode)'),
      content: z.string().optional().describe('Inline rule content'),
      path: z.string().optional().describe('Local file path to rule content'),
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
   .refine(
      (data) => {
         if (data.activation === 'auto' && !data.description) {
            return false;
         }
         return true;
      },
      { message: 'description is required when activation is "auto"' },
   )
   .refine(
      (data) => {
         if (data.activation === 'glob' && (!data.globs || data.globs.length === 0)) {
            return false;
         }
         return true;
      },
      { message: 'globs is required when activation is "glob"' },
   )
   .describe('Rule with metadata and content source');

/**
 * String shorthand for source references (npm-style):
 * - Local paths: "./rules/style.md", "../shared/rules.md", "/abs/path", "file:../foo"
 * - Git URLs: "https://...", "git+https://...", "github:user/repo", "user/repo#ref"
 *
 * Inline content requires object form: { "content": "..." }
 */
const ruleStringSchema = z
   .string()
   .describe(
      'Source reference: local path (./, ../, /, file:), git URL (https://), or git shorthand (github:)',
   );

/**
 * A rule value can be:
 * - String: source reference (local path or git URL) - normalized at parse time
 * - Object: full rule with content source and optional metadata
 */
export const ruleValueSchema = z.union([ruleStringSchema, ruleObjectSchema]);

/**
 * Rule name validation (key in the rules object).
 */
export const ruleNameSchema = z
   .string()
   .min(1)
   .max(64)
   .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Rule name must be lowercase alphanumeric with single hyphens (e.g., "code-style")',
   )
   .describe('Rule name (used as key)');

/**
 * Rules config - object keyed by rule name.
 */
export const rulesSchema = z
   .record(ruleNameSchema, z.union([ruleValueSchema, z.literal(false)]))
   .describe('Map of rule names to their definitions (or false to disable)');

export type ActivationMode = z.infer<typeof activationModeSchema>;
export type GitSource = z.infer<typeof gitSourceSchema>;
export type NpmSource = z.infer<typeof npmSourceSchema>;
export type RuleObject = z.infer<typeof ruleObjectSchema>;
export type RuleValue = z.infer<typeof ruleValueSchema>;
export type RulesConfig = z.infer<typeof rulesSchema>;
