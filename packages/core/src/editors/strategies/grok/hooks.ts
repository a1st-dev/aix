import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

/**
 * Map from generic ai.json hook events to Grok CLI hook event names.
 */
const EVENT_MAP: Record<string, string> = {
   // Lifecycle.
   session_start: 'SessionStart',
   session_end: 'SessionEnd',

   // Prompt.
   pre_prompt: 'UserPromptSubmit',

   // Tool use.
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   post_tool_use_failure: 'PostToolUseFailure',
   permission_denied: 'PermissionDenied',

   // Agent / response.
   agent_stop: 'Stop',

   // System / context.
   pre_compact: 'PreCompact',
   post_compact: 'PostCompact',
   notification: 'Notification',

   // Tool-scoped aliases, narrowed by TOOL_MATCHER_MAP below.
   pre_command: 'PreToolUse',
   post_command: 'PostToolUse',
   pre_file_read: 'PreToolUse',
   post_file_read: 'PostToolUse',
   pre_file_write: 'PreToolUse',
   post_file_write: 'PostToolUse',
   pre_mcp_tool: 'PreToolUse',
   post_mcp_tool: 'PostToolUse',
};

const TOOL_MATCHER_MAP: Record<string, string> = {
   pre_command: 'Bash',
   post_command: 'Bash',
   pre_file_read: 'Read',
   post_file_read: 'Read',
   pre_file_write: 'Edit|Write',
   post_file_write: 'Edit|Write',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

const GROK_HOOK_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'powershell',
   'shell',
   'timeout',
   'url',
   'headers',
]);

interface GrokCommandHookEntry {
   type: 'command';
   command: string;
   timeout?: number;
}

interface GrokHttpHookEntry {
   type: 'http';
   url: string;
   headers?: Record<string, string>;
   timeout?: number;
}

type GrokHookEntry = GrokCommandHookEntry | GrokHttpHookEntry;

interface GrokMatcherGroup {
   matcher?: string;
   hooks: GrokHookEntry[];
}

function buildGrokHook(action: HookAction): GrokHookEntry | undefined {
   if (action.type === 'http' || (!action.type && action.url)) {
      if (!action.url) {
         return undefined;
      }
      const httpEntry: GrokHttpHookEntry = {
         type: 'http',
         url: action.url,
      };

      if (action.headers && Object.keys(action.headers).length > 0) {
         httpEntry.headers = action.headers;
      }
      if (typeof action.timeout === 'number' && action.timeout > 0) {
         httpEntry.timeout = action.timeout;
      }
      return httpEntry;
   }

   const command = action.command ?? action.bash ?? action.powershell;

   if (!command) {
      return undefined;
   }

   const entry: GrokCommandHookEntry = {
      type: 'command',
      command,
   };

   if (typeof action.timeout === 'number' && action.timeout > 0) {
      entry.timeout = action.timeout;
   }

   return entry;
}

function parseGrokHook(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>;

   if (entry.type === 'http' && typeof entry.url === 'string') {
      const action: HookAction = {
         type: 'http',
         url: entry.url,
      };

      if (entry.headers && typeof entry.headers === 'object') {
         action.headers = entry.headers as Record<string, string>;
      }
      if (typeof entry.timeout === 'number') {
         action.timeout = entry.timeout;
      }
      return action;
   }

   if (typeof entry.command === 'string') {
      const action: HookAction = {
         type: 'command',
         command: entry.command,
      };

      if (typeof entry.timeout === 'number') {
         action.timeout = entry.timeout;
      }
      return action;
   }

   return null;
}

export class GrokHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.grok/hooks.json';
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
                  .filter((field) => !GROK_HOOK_FIELDS.has(field));

               if (action.type && action.type !== 'command' && action.type !== 'http') {
                  fields.push('type');
               }
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
            parseAction: parseGrokHook,
            toolMatchers: TOOL_MATCHER_MAP,
         }),
         warnings: parsed.warnings,
      };
   }

   formatConfig(hooks: HooksConfig): string {
      const grokHooks: Record<string, GrokMatcherGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const grokEvent = EVENT_MAP[event];

         if (!grokEvent || !matchers) {
            continue;
         }

         const toolMatcher = TOOL_MATCHER_MAP[event];
         const groups = matchers.map((matcher: HookMatcher) => {
            const entries = matcher.hooks
               .map((action) => buildGrokHook(action))
               .filter((entry): entry is GrokHookEntry => entry !== undefined);
            const group: GrokMatcherGroup = { hooks: entries };

            if (toolMatcher ?? matcher.matcher) {
               group.matcher = toolMatcher ?? matcher.matcher;
            }
            return group;
         }).filter((group) => group.hooks.length > 0);

         if (groups.length === 0) {
            continue;
         }

         grokHooks[grokEvent] = (grokHooks[grokEvent] ?? []).concat(groups);
      }

      return JSON.stringify({ hooks: grokHooks }, null, 2) + '\n';
   }
}
