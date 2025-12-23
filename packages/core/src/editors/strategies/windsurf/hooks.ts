import type { HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * Map from generic ai.json hook events to Windsurf's snake_case event names.
 */
const EVENT_MAP: Record<string, string> = {
   pre_file_read: 'pre_read_code',
   post_file_read: 'post_read_code',
   pre_file_write: 'pre_write_code',
   post_file_write: 'post_write_code',
   pre_command: 'pre_run_command',
   post_command: 'post_run_command',
   pre_mcp_tool: 'pre_mcp_tool_use',
   post_mcp_tool: 'post_mcp_tool_use',
   pre_prompt: 'pre_user_prompt',
   agent_stop: 'post_cascade_response',
};

/**
 * Events that Windsurf supports.
 */
const SUPPORTED_EVENTS = new Set([
   'pre_file_read',
   'post_file_read',
   'pre_file_write',
   'post_file_write',
   'pre_command',
   'post_command',
   'pre_mcp_tool',
   'post_mcp_tool',
   'pre_prompt',
   'agent_stop',
]);

/**
 * Windsurf hooks strategy. Writes hooks to `hooks.json` in the `.windsurf` directory.
 * Translates generic ai.json event names to Windsurf's snake_case format.
 */
export class WindsurfHooksStrategy implements HooksStrategy {
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
      const windsurfHooks: Record<string, unknown[]> = {};

      for (const [event, matchers] of Object.entries(hooks)) {
         const windsurfEvent = EVENT_MAP[event];

         if (!windsurfEvent) {
            continue;
         }

         windsurfHooks[windsurfEvent] = matchers.flatMap((matcher: HookMatcher) =>
            matcher.hooks.map((hook) => ({
               command: hook.command,
               ...(hook.show_output !== undefined && { show_output: hook.show_output }),
               ...(hook.working_directory && { working_directory: hook.working_directory }),
            })),
         );
      }

      return JSON.stringify({ hooks: windsurfHooks }, null, 2) + '\n';
   }
}
