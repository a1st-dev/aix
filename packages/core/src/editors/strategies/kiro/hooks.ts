import type { HooksStrategy } from '../types.js';
import type { HooksConfig } from '@a1st/aix-schema';

/**
 * Map from generic ai.json hook events to Kiro's event types.
 * Note: Kiro uses different event names than the generic ai.json format.
 */
const EVENT_MAP: Record<string, string> = {
   post_file_write: 'fileEdited',
   pre_prompt: 'promptSubmit',
   agent_stop: 'agentStop',
};

/**
 * Events that Kiro supports.
 */
const SUPPORTED_EVENTS = new Set(['post_file_write', 'pre_prompt', 'agent_stop']);

/**
 * Kiro hooks strategy - formats hooks as individual JSON files.
 * Each hook becomes a separate JSON file in `.kiro/hooks/` directory.
 */
export class KiroHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks';
   }

   formatConfig(hooks: HooksConfig): string {
      // Kiro uses individual JSON files per hook
      // This method returns a JSON representation that will be split into files
      const formattedHooks: Record<string, unknown> = {};

      for (const [eventName, matchers] of Object.entries(hooks)) {
         const kiroEvent = EVENT_MAP[eventName];

         if (!kiroEvent) {
            continue;
         }

         // Each matcher can have multiple hooks
         for (const matcher of matchers) {
            for (let i = 0; i < matcher.hooks.length; i++) {
               const hook = matcher.hooks[i];

               if (!hook) {
                  continue;
               }

               const hookName = `${eventName}-hook-${i}`;

               formattedHooks[hookName] = {
                  name: hookName,
                  version: '1.0.0',
                  description: `Hook for ${eventName}`,
                  when: {
                     type: kiroEvent,
                     ...(matcher.matcher && { patterns: [matcher.matcher] }),
                  },
                  // eslint-disable-next-line unicorn/no-thenable -- Kiro hook schema uses 'then'
                  then: {
                     type: 'runCommand',
                     command: hook.command,
                  },
               };
            }
         }
      }

      return JSON.stringify({ hooks: formattedHooks }, null, 2) + '\n';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }
}
