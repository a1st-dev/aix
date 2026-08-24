import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

/**
 * Map from generic ai.json hook events to Codex hook event names.
 * Source: https://learn.chatgpt.com/docs/hooks
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
   permission_request: 'PermissionRequest',

   // Agent / response.
   agent_stop: 'Stop',
   subagent_start: 'SubagentStart',
   subagent_stop: 'SubagentStop',

   // System / context.
   pre_compact: 'PreCompact',
   post_compact: 'PostCompact',

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

const CODEX_COMMAND_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'powershell',
   'shell',
   'timeout',
   'status_message',
   'async',
]);

interface CodexCommandHookEntry {
   type: 'command';
   command?: string;
   commandWindows?: string;
   timeout?: number;
   statusMessage?: string;
   async?: boolean;
}

interface CodexMatcherGroup {
   matcher?: string;
   hooks: CodexCommandHookEntry[];
}

function buildCodexHook(action: HookAction): CodexCommandHookEntry | undefined {
   const usePosix = action.shell !== 'powershell',
         useWindows = action.shell !== 'bash',
         command = usePosix ? action.command ?? action.bash : undefined,
         commandWindows = useWindows
            ? action.powershell ?? (action.shell === 'powershell' ? action.command : undefined)
            : undefined;

   if (!command && !commandWindows || action.type && action.type !== 'command') {
      return undefined;
   }

   const entry: CodexCommandHookEntry = { type: 'command' };

   if (command !== undefined) {
      entry.command = command;
   }
   if (commandWindows !== undefined) {
      entry.commandWindows = commandWindows;
   }
   if (action.timeout !== undefined) {
      entry.timeout = action.timeout;
   }
   if (action.status_message !== undefined) {
      entry.statusMessage = action.status_message;
   }
   if (action.async !== undefined) {
      entry.async = action.async;
   }

   return entry;
}

function nonEmptyString(value: unknown): string | undefined {
   return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseCodexHook(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>,
         command = nonEmptyString(entry.command),
         commandWindows = nonEmptyString(entry.commandWindows);

   if (entry.type !== 'command' || !command && !commandWindows) {
      return null;
   }

   const action: HookAction = { type: 'command' };

   if (command !== undefined) {
      action.command = command;
   }
   if (commandWindows !== undefined) {
      action.powershell = commandWindows;
   }
   if (typeof entry.timeout === 'number' && entry.timeout > 0) {
      action.timeout = entry.timeout;
   }
   if (typeof entry.statusMessage === 'string' && entry.statusMessage.length > 0) {
      action.status_message = entry.statusMessage;
   }
   if (typeof entry.async === 'boolean') {
      action.async = entry.async;
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
