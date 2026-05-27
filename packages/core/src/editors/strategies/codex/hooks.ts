import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

/**
 * Map from generic ai.json hook events to Codex hook event names.
 * Source: https://developers.openai.com/codex/hooks
 */
const EVENT_MAP: Record<string, string> = {
   session_start: 'SessionStart',
   pre_prompt: 'UserPromptSubmit',
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   permission_request: 'PermissionRequest',
   agent_stop: 'Stop',
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

const CODEX_COMMAND_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'powershell',
   'timeout',
   'status_message',
]);

interface CodexCommandHookEntry {
   type: 'command';
   command: string;
   timeout?: number;
   statusMessage?: string;
}

interface CodexMatcherGroup {
   matcher?: string;
   hooks: CodexCommandHookEntry[];
}

function buildCodexHook(action: HookAction): CodexCommandHookEntry | undefined {
   const command = action.command ?? action.bash ?? action.powershell;

   if (!command || action.type && action.type !== 'command') {
      return undefined;
   }

   const entry: CodexCommandHookEntry = { type: 'command', command };

   if (action.timeout !== undefined) {
      entry.timeout = action.timeout;
   }
   if (action.status_message !== undefined) {
      entry.statusMessage = action.status_message;
   }

   return entry;
}

function parseCodexHook(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>;

   if (entry.type !== 'command' || typeof entry.command !== 'string' || entry.command.length === 0) {
      return null;
   }

   const action: HookAction = {
      type: 'command',
      command: entry.command,
   };

   if (typeof entry.timeout === 'number' && entry.timeout > 0) {
      action.timeout = entry.timeout;
   }
   if (typeof entry.statusMessage === 'string' && entry.statusMessage.length > 0) {
      action.status_message = entry.statusMessage;
   }

   return action;
}

export class CodexHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.codex/hooks.json';
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
                  .filter((field) => !CODEX_COMMAND_FIELDS.has(field));

               if (action.type && action.type !== 'command') {
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
            parseAction: parseCodexHook,
            toolMatchers: TOOL_MATCHER_MAP,
         }),
         warnings: parsed.warnings,
      };
   }

   formatConfig(hooks: HooksConfig): string {
      const codexHooks: Record<string, CodexMatcherGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const codexEvent = EVENT_MAP[event];

         if (!codexEvent || !matchers) {
            continue;
         }

         const toolMatcher = TOOL_MATCHER_MAP[event];
         const groups = matchers.map((matcher: HookMatcher) => {
            const entries = matcher.hooks
               .map((action) => buildCodexHook(action))
               .filter((entry): entry is CodexCommandHookEntry => entry !== undefined);
            const group: CodexMatcherGroup = { hooks: entries };

            if (toolMatcher ?? matcher.matcher) {
               group.matcher = toolMatcher ?? matcher.matcher;
            }
            return group;
         }).filter((group) => group.hooks.length > 0);

         if (groups.length === 0) {
            continue;
         }

         codexHooks[codexEvent] = (codexHooks[codexEvent] ?? []).concat(groups);
      }

      return JSON.stringify({ hooks: codexHooks }, null, 2) + '\n';
   }
}
