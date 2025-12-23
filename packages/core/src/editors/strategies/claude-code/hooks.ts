import type { HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * Map from generic ai.json hook events to Claude Code's PascalCase event names.
 */
const EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   pre_command: 'PreToolUse', // Claude Code uses PreToolUse with Bash matcher
   post_command: 'PostToolUse',
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   agent_stop: 'Stop',
   pre_prompt: 'UserPromptSubmit',
};

/**
 * Events that Claude Code supports but we don't have generic mappings for yet.
 * These are Claude Code-specific and users can still use them via the native format.
 */
const SUPPORTED_EVENTS = new Set([
   'pre_tool_use',
   'post_tool_use',
   'pre_command',
   'post_command',
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

         claudeHooks[claudeEvent] = matchers.map((matcher: HookMatcher) => ({
            matcher: matcher.matcher ?? '',
            hooks: matcher.hooks.map((hook) => ({
               type: 'command' as const,
               command: hook.command,
               ...(hook.timeout && { timeout: hook.timeout }),
            })),
         }));
      }

      return JSON.stringify({ hooks: claudeHooks }, null, 2) + '\n';
   }
}
