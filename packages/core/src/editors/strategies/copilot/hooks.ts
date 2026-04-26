import type { HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * Map from generic ai.json hook events to GitHub Copilot's camelCase event names.
 * GitHub Copilot supports these events as per official documentation.
 */
const EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'preToolUse',
   post_tool_use: 'postToolUse',
   pre_file_read: 'preToolUse',
   post_file_read: 'postToolUse',
   pre_file_write: 'preToolUse',
   post_file_write: 'postToolUse',
   pre_command: 'preToolUse',
   post_command: 'postToolUse',
   pre_mcp_tool: 'preToolUse',
   post_mcp_tool: 'postToolUse',
   session_start: 'sessionStart',
   session_end: 'sessionEnd',
   agent_stop: 'stop',
   pre_prompt: 'userPromptSubmitted',
   pre_compact: 'preCompact',
   subagent_start: 'subagentStart',
   subagent_stop: 'subagentStop',
};

/**
 * Tool-name matchers to inject for events that target a specific GitHub Copilot tool.
 * GitHub Copilot uses the same tool naming convention as Claude Code for hook matchers.
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
 * Events that GitHub Copilot supports.
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
   'pre_compact',
   'subagent_start',
   'subagent_stop',
]);

/**
 * GitHub Copilot hooks strategy. Writes hooks to `.github/hooks/hooks.json`.
 * Translates generic ai.json event names to GitHub Copilot's camelCase format.
 * Uses the same matcher-based structure as Claude Code hooks.
 */
export class CopilotHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      // GitHub Copilot hooks live in .github/hooks/, not in .vscode/
      return '../.github/hooks/hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.copilot/hooks/hooks.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   formatConfig(hooks: HooksConfig): string {
      const copilotHooks: Record<string, unknown[]> = {};

      for (const [event, matchers] of Object.entries(hooks)) {
         const copilotEvent = EVENT_MAP[event];

         if (!copilotEvent) {
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

         if (!copilotHooks[copilotEvent]) {
            copilotHooks[copilotEvent] = [];
         }
         copilotHooks[copilotEvent].push(...mapped);
      }

      return JSON.stringify({ hooks: copilotHooks }, null, 2) + '\n';
   }
}
