import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, UnsupportedHookField } from '../types.js';

/**
 * Map from generic ai.json hook events to Gemini CLI's PascalCase event names.
 * Source: google-gemini/gemini-cli `docs/hooks/reference.md` and
 * https://geminicli.com/docs/hooks/.
 */
const EVENT_MAP: Record<string, string> = {
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   pre_agent: 'BeforeAgent',
   post_agent: 'AfterAgent',
   pre_model_request: 'BeforeModel',
   post_model_response: 'AfterModel',
   pre_tool_selection: 'BeforeToolSelection',
   pre_tool_use: 'BeforeTool',
   post_tool_use: 'AfterTool',
   pre_compact: 'PreCompress',
   notification: 'Notification',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/** Fields Gemini accepts on a hook configuration. */
const GEMINI_RECOGNIZED_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'timeout',
   'description',
   'name',
]);

interface GeminiHookConfig {
   type: 'command';
   command: string;
   timeout?: number;
   name?: string;
   description?: string;
}

interface GeminiHookGroup {
   matcher?: string;
   sequential?: boolean;
   hooks: GeminiHookConfig[];
}

function buildGeminiHook(action: HookAction): GeminiHookConfig | undefined {
   const command = action.command ?? action.bash;

   if (!command) {
      return undefined;
   }

   const entry: GeminiHookConfig = { type: 'command', command };

   if (action.timeout !== undefined) {
      // aix uses seconds; Gemini uses milliseconds (default 60000).
      entry.timeout = action.timeout * 1000;
   }
   if (action.name) {
      entry.name = action.name;
   }
   if (action.description) {
      entry.description = action.description;
   }
   return entry;
}

/**
 * Gemini CLI hooks strategy. Writes hooks into `.gemini/settings.json` under a top-level
 * `hooks` object. The base adapter's JSON merge keeps unrelated settings keys intact.
 */
export class GeminiHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getGlobalConfigPath(): string {
      return '.gemini/settings.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   getUnsupportedFields(hooks: HooksConfig): UnsupportedHookField[] {
      const result: UnsupportedHookField[] = [];

      for (const [ event, matchers ] of Object.entries(hooks)) {
         matchers?.forEach((matcher: HookMatcher, matcherIndex: number) => {
            matcher.hooks?.forEach((action, actionIndex) => {
               const fields = (Object.keys(action) as (keyof HookAction)[])
                  .filter((field) => !GEMINI_RECOGNIZED_FIELDS.has(field));

               if (fields.length > 0) {
                  result.push({ event, matcherIndex, actionIndex, fields });
               }
            });
         });
      }

      return result;
   }

   getSupportedEvents(): readonly string[] {
      return Object.keys(EVENT_MAP).toSorted();
   }

   getNativeEventNames(): readonly string[] {
      return Array.from(new Set(Object.values(EVENT_MAP))).toSorted();
   }

   formatConfig(hooks: HooksConfig): string {
      const geminiHooks: Record<string, GeminiHookGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const geminiEvent = EVENT_MAP[event];

         if (!geminiEvent || !matchers) {
            continue;
         }

         const groups = matchers.map((matcher: HookMatcher) => {
            const entries = matcher.hooks
               .map((action) => buildGeminiHook(action))
               .filter((entry): entry is GeminiHookConfig => entry !== undefined);

            const group: GeminiHookGroup = { hooks: entries };

            if (matcher.matcher) {
               group.matcher = matcher.matcher;
            }
            if (matcher.sequential !== undefined) {
               group.sequential = matcher.sequential;
            }
            return group;
         }).filter((group) => group.hooks.length > 0);

         if (groups.length === 0) {
            continue;
         }

         geminiHooks[geminiEvent] = (geminiHooks[geminiEvent] ?? []).concat(groups);
      }

      return JSON.stringify({ hooks: geminiHooks }, null, 2) + '\n';
   }
}
