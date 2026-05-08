import { z } from 'zod';

/**
 * Generic hook event types that map to editor-specific events. Adapters translate these
 * normalized names into the editor's native event names.
 *
 * Events are grouped (lifecycle, prompt, tool, model, agent, system) but the enum is a
 * flat list for ergonomic configuration.
 */
export const hookEventSchema = z
   .enum([
      // Lifecycle.
      'session_start',
      'session_end',
      'setup',

      // Prompt.
      'pre_prompt',
      'user_prompt_expansion',

      // Tool execution.
      'pre_tool_use',
      'post_tool_use',
      'post_tool_use_failure',
      'post_tool_batch',
      'pre_tool_selection',
      'permission_request',
      'permission_denied',
      'pre_file_read',
      'post_file_read',
      'pre_file_write',
      'post_file_write',
      'pre_command',
      'post_command',
      'pre_mcp_tool',
      'post_mcp_tool',
      'pre_tab_file_read',
      'post_tab_file_edit',

      // Model.
      'pre_model_request',
      'post_model_response',
      'pre_response_chunk',

      // Agent / response.
      'pre_agent',
      'post_agent',
      'post_response',
      'post_response_with_transcript',
      'agent_stop',
      'subagent_start',
      'subagent_stop',
      'subagent_idle',

      // System / context.
      'pre_compact',
      'post_compact',
      'task_created',
      'task_completed',
      'worktree_setup',
      'worktree_remove',
      'instructions_loaded',
      'config_change',
      'cwd_changed',
      'file_changed',
      'notification',
      'elicitation',
      'elicitation_result',
      'error_occurred',
   ])
   .describe('Hook event type');

export type HookEvent = z.infer<typeof hookEventSchema>;

/**
 * Hook action handler kind. `command` runs a shell command, `prompt` and `agent` defer
 * to an LLM, `http` sends a POST request, and `mcp_tool` invokes a configured MCP tool.
 * Adapters drop unsupported kinds with a warning instead of failing the install.
 */
export const hookActionTypeSchema = z
   .enum(['command', 'http', 'mcp_tool', 'prompt', 'agent'])
   .describe('Hook action handler kind');

export type HookActionType = z.infer<typeof hookActionTypeSchema>;

/**
 * Individual hook action configuration. The schema is intentionally permissive: every
 * field except for the conceptual command is optional, and adapters report any field
 * the target editor cannot express through `HooksStrategy.getUnsupportedFields`.
 */
export const hookActionSchema = z
   .object({
      type: hookActionTypeSchema.optional().describe(
         'Action handler kind (default: "command").',
      ),

      // Command-style execution.
      command: z.string().optional().describe('Shell command to execute.'),
      bash: z.string().optional().describe('Bash command (macOS / Linux).'),
      powershell: z.string().optional().describe('PowerShell command (Windows).'),
      shell: z.enum(['bash', 'powershell']).optional().describe(
         'Shell selector when only one of `command` / `bash` / `powershell` is set.',
      ),
      timeout: z.number().positive().optional().describe(
         'Timeout in seconds. Adapters convert to native units (e.g. milliseconds).',
      ),
      show_output: z.boolean().optional().describe(
         'Whether to surface command output in the editor UI (Windsurf-specific).',
      ),
      working_directory: z.string().optional().describe(
         'Working directory for the command. Interchangeable with `cwd`; the strategy decides which native key to emit (Windsurf uses `working_directory`; Copilot, Gemini, and Claude Code use `cwd`).',
      ),
      cwd: z.string().optional().describe(
         'Working directory for the command. Interchangeable with `working_directory`.',
      ),
      env: z.record(z.string(), z.string()).optional().describe(
         'Environment variables to set when running the command.',
      ),

      // Async execution (Claude Code).
      async: z.boolean().optional().describe(
         'Run the command in the background without blocking the agent.',
      ),
      async_rewake: z.boolean().optional().describe(
         'Run async; on exit code 2, wake the agent with stderr/stdout context.',
      ),

      // Conditional / metadata.
      if: z.string().optional().describe(
         'Permission-rule expression (Claude Code) gating execution.',
      ),
      status_message: z.string().optional().describe(
         'Custom spinner message while the hook runs (Claude Code).',
      ),
      once: z.boolean().optional().describe(
         'Run once per session, then unregister (Claude Code skill / agent frontmatter).',
      ),

      // HTTP webhook.
      url: z.string().optional().describe('URL to POST hook input to (Claude Code HTTP).'),
      headers: z.record(z.string(), z.string()).optional().describe(
         'Additional HTTP headers, with env-var interpolation (Claude Code HTTP).',
      ),
      allowed_env_vars: z.array(z.string()).optional().describe(
         'Env-var allowlist for header interpolation (Claude Code HTTP).',
      ),

      // MCP tool dispatch.
      mcp_server: z.string().optional().describe(
         'Configured MCP server name (Claude Code mcp_tool).',
      ),
      mcp_tool: z.string().optional().describe(
         'Tool name on the MCP server (Claude Code mcp_tool).',
      ),
      mcp_input: z.record(z.string(), z.unknown()).optional().describe(
         'Arguments for the MCP tool, with `${tool_input.x}` substitution (Claude Code).',
      ),

      // Prompt / agent (LLM-evaluated).
      prompt: z.string().optional().describe('Prompt text (Claude Code, Cursor, Copilot).'),
      model: z.string().optional().describe('Model override for prompt / agent hooks.'),

      // Documentation / management.
      description: z.string().optional().describe('Free-form description for logs / UI.'),
      name: z.string().optional().describe('Friendly identifier for logs and CLI commands.'),

      // Cursor-specific behaviors.
      fail_closed: z.boolean().optional().describe(
         'Block the action when the hook itself fails (Cursor).',
      ),
      loop_limit: z.number().int().nullable().optional().describe(
         'Max auto-triggered follow-ups for stop-style events (Cursor).',
      ),
   })
   .describe('Hook action configuration');

export type HookAction = z.infer<typeof hookActionSchema>;

/**
 * Hook matcher with associated actions. `matcher` filters when the actions run; on
 * editors that support it, `sequential` controls whether actions in the group fan out in
 * parallel (default) or run one at a time. `description` is for documentation only.
 */
export const hookMatcherSchema = z
   .object({
      matcher: z.string().optional().describe(
         'Pattern to match (regex or pipe-separated literal, editor-specific).',
      ),
      sequential: z.boolean().optional().describe(
         'Run hooks in this group sequentially instead of in parallel (Gemini).',
      ),
      description: z.string().optional().describe('Free-form description for the group.'),
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
