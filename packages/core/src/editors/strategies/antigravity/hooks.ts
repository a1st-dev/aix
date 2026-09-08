import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

/**
 * Map from generic ai.json hook events to Antigravity's PascalCase lifecycle event names.
 */
const EVENT_MAP: Record<string, string> = {
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   pre_agent: 'PreInvocation',
   post_agent: 'PostInvocation',
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   agent_stop: 'Stop',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/** Fields Antigravity accepts on a hook action configuration. */
const ANTIGRAVITY_RECOGNIZED_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'timeout',
   'description',
   'name',
]);

interface AntigravityHookConfig {
   type: 'command';
   command: string;
   timeout?: number;
   name?: string;
   description?: string;
}

interface AntigravityHookGroup {
   matcher?: string;
   hooks: AntigravityHookConfig[];
}

function buildAntigravityHook(action: HookAction): AntigravityHookConfig | undefined {
   const command = action.command ?? action.bash;

   if (!command) {
      return undefined;
   }

   const entry: AntigravityHookConfig = { type: 'command', command };

   if (action.timeout !== undefined) {
      entry.timeout = action.timeout;
   }
   if (action.name) {
      entry.name = action.name;
   }
   if (action.description) {
      entry.description = action.description;
   }
   return entry;
}

function parseAntigravityAction(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>;

   if (entry.type !== 'command' || typeof entry.command !== 'string' || entry.command.length === 0) {
      return null;
   }

   const action: HookAction = {
      command: entry.command,
   };

   if (typeof entry.timeout === 'number' && entry.timeout > 0) {
      action.timeout = entry.timeout;
   }
   if (typeof entry.name === 'string' && entry.name.length > 0) {
      action.name = entry.name;
   }
   if (typeof entry.description === 'string' && entry.description.length > 0) {
      action.description = entry.description;
   }

   return action;
}

/**
 * Antigravity hooks strategy. Writes hooks into `.agents/hooks.json` (or global
 * `~/.gemini/config/hooks.json`) under a top-level `hooks` object.
 */
export class AntigravityHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.gemini/config/hooks.json';
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
                  .filter((field) => !ANTIGRAVITY_RECOGNIZED_FIELDS.has(field));

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

   parseImportedConfig(content: string): ParsedHooksImportResult {
      const parsed = parseHookObject(content);

      if (!parsed.rawHooks) {
         return { hooks: {}, warnings: parsed.warnings };
      }

      return {
         hooks: parseMatcherImportedHooks(parsed.rawHooks, {
            eventMap: EVENT_MAP,
            parseAction: parseAntigravityAction,
         }),
         warnings: parsed.warnings,
      };
   }

   formatConfig(hooks: HooksConfig): string {
      const antigravityHooks: Record<string, AntigravityHookGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const nativeEvent = EVENT_MAP[event];

         if (!nativeEvent || !matchers) {
            continue;
         }

         const groups = matchers.map((matcher: HookMatcher) => {
            const entries = matcher.hooks
               .map((action) => buildAntigravityHook(action))
               .filter((entry): entry is AntigravityHookConfig => entry !== undefined);

            const group: AntigravityHookGroup = { hooks: entries };

            if (matcher.matcher) {
               group.matcher = matcher.matcher;
            }
            return group;
         }).filter((group) => group.hooks.length > 0);

         if (groups.length === 0) {
            continue;
         }

         antigravityHooks[nativeEvent] = (antigravityHooks[nativeEvent] ?? []).concat(groups);
      }

      return JSON.stringify({ hooks: antigravityHooks }, null, 2) + '\n';
   }
}
