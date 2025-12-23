import { z } from 'zod';

/**
 * Generic hook event types that map to editor-specific events.
 * These are normalized event names that adapters translate to native formats.
 */
export const hookEventSchema = z
   .enum([
      'pre_tool_use',
      'post_tool_use',
      'pre_file_read',
      'post_file_read',
      'pre_file_write',
      'post_file_write',
      'pre_command',
      'post_command',
      'pre_mcp_tool',
      'post_mcp_tool',
      'pre_prompt',
      'session_start',
      'session_end',
      'agent_stop',
   ])
   .describe('Hook event type');

export type HookEvent = z.infer<typeof hookEventSchema>;

/**
 * Individual hook action configuration.
 */
export const hookActionSchema = z
   .object({
      command: z.string().describe('Shell command to execute'),
      timeout: z.number().positive().optional().describe('Timeout in seconds'),
      show_output: z.boolean().optional().describe('Whether to show command output in UI'),
      working_directory: z.string().optional().describe('Working directory for the command'),
   })
   .describe('Hook action configuration');

export type HookAction = z.infer<typeof hookActionSchema>;

/**
 * Hook matcher with associated actions. The matcher is an optional regex pattern to filter events.
 */
export const hookMatcherSchema = z
   .object({
      matcher: z.string().optional().describe('Pattern to match (regex supported, editor-specific)'),
      hooks: z.array(hookActionSchema).describe('Hooks to execute when matched'),
   })
   .describe('Hook matcher configuration');

export type HookMatcher = z.infer<typeof hookMatcherSchema>;

/**
 * Full hooks configuration - maps event types to arrays of matchers.
 */
export const hooksSchema = z
   .record(hookEventSchema, z.array(hookMatcherSchema))
   .describe('Hooks configuration for lifecycle events');

export type HooksConfig = z.infer<typeof hooksSchema>;
