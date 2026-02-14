import type { HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * Map from generic ai.json hook events to Claude Code's PascalCase event names.
 */
const EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   pre_file_read: 'PreToolUse',
   post_file_read: 'PostToolUse',
   pre_file_write: 'PreToolUse',
   post_file_write: 'PostToolUse',
   pre_command: 'PreToolUse',
   post_command: 'PostToolUse',
   pre_mcp_tool: 'PreToolUse',
   post_mcp_tool: 'PostToolUse',
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   agent_stop: 'Stop',
   pre_prompt: 'UserPromptSubmit',
};

/**
 * Tool-name matchers to inject for events that target a specific Claude Code tool.
 * Events not listed here use the user-supplied matcher (or empty string for all tools).
 */
const TOOL_MATCHER_MAP: Record<string, string> = {
   pre_command: 'Bash',
   post_command: 'Bash',
   pre_file_read: 'Read',
   post_file_read: 'Read',
   pre_file_write: 'Write|Edit',
   post_file_write: 'Write|Edit',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

/**
 * Events that Claude Code supports.
 */
const SUPPORTED_EVENTS = new Set([
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
   'session_start',
   'session_end',
   'agent_stop',
   'pre_prompt',
]);

/**
 * Claude Code hooks strategy. Writes hooks to `settings.json` in the `.claude` directory.
 * Translates generic ai.json event names to Claude Code's PascalCase format.
 */
export class ClaudeCodeHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   formatConfig(hooks: HooksConfig): string {
      const claudeHooks: Record<string, unknown[]> = {};

      for (const [event, matchers] of Object.entries(hooks)) {
         const claudeEvent = EVENT_MAP[event];

         if (!claudeEvent) {
            continue;
         }

         const toolMatcher = TOOL_MATCHER_MAP[event];
         const mapped = matchers.map((matcher: HookMatcher) => ({
            matcher: toolMatcher ?? matcher.matcher ?? '',
            hooks: matcher.hooks.map((hook) => ({
               type: 'command' as const,
               command: hook.command,
               ...(hook.timeout && { timeout: hook.timeout }),
            })),
         }));

         if (!claudeHooks[claudeEvent]) {
            claudeHooks[claudeEvent] = [];
         }
         claudeHooks[claudeEvent].push(...mapped);
      }

      return JSON.stringify({ hooks: claudeHooks }, null, 2) + '\n';
   }
}
