import type { HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * Map from generic ai.json hook events to Cursor's camelCase event names.
 */
const EVENT_MAP: Record<string, string> = {
   pre_command: 'beforeShellExecution',
   post_command: 'afterShellExecution',
   pre_mcp_tool: 'beforeMCPExecution',
   post_mcp_tool: 'afterMCPExecution',
   post_file_write: 'afterFileEdit',
   pre_prompt: 'beforeSubmitPrompt',
   agent_stop: 'stop',
};

/**
 * Events that Cursor supports.
 */
const SUPPORTED_EVENTS = new Set([
   'pre_command',
   'post_command',
   'pre_mcp_tool',
   'post_mcp_tool',
   'post_file_write',
   'pre_prompt',
   'agent_stop',
]);

/**
 * Cursor hooks strategy. Writes hooks to `hooks.json` in the `.cursor` directory.
 * Translates generic ai.json event names to Cursor's camelCase format.
 */
export class CursorHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   formatConfig(hooks: HooksConfig): string {
      const cursorHooks: Record<string, unknown[]> = {};

      for (const [event, matchers] of Object.entries(hooks)) {
         const cursorEvent = EVENT_MAP[event];

         if (!cursorEvent) {
            continue;
         }

         cursorHooks[cursorEvent] = matchers.flatMap((matcher: HookMatcher) =>
            matcher.hooks.map((hook) => ({
               command: hook.command,
               ...(hook.timeout && { timeout: hook.timeout }),
            })),
         );
      }

      return JSON.stringify({ hooks: cursorHooks }, null, 2) + '\n';
   }
}
