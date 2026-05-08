import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, UnsupportedHookField } from '../types.js';

/**
 * Map from generic ai.json hook events to Cursor's camelCase event names.
 *
 * Cursor does not document a transcript-aware response variant, so
 * `post_response_with_transcript` reuses `afterAgentResponse` and the missing transcript
 * field is reported via `getUnsupportedFields`.
 */
const EVENT_MAP: Record<string, string> = {
   session_start: 'sessionStart',
   session_end: 'sessionEnd',
   pre_tool_use: 'preToolUse',
   post_tool_use: 'postToolUse',
   post_tool_use_failure: 'postToolUseFailure',
   subagent_start: 'subagentStart',
   subagent_stop: 'subagentStop',
   pre_file_read: 'beforeReadFile',
   pre_command: 'beforeShellExecution',
   post_command: 'afterShellExecution',
   pre_mcp_tool: 'beforeMCPExecution',
   post_mcp_tool: 'afterMCPExecution',
   post_file_write: 'afterFileEdit',
   pre_prompt: 'beforeSubmitPrompt',
   pre_compact: 'preCompact',
   post_response: 'afterAgentResponse',
   post_response_with_transcript: 'afterAgentResponse',
   pre_response_chunk: 'afterAgentThought',
   agent_stop: 'stop',
   pre_tab_file_read: 'beforeTabFileRead',
   post_tab_file_edit: 'afterTabFileEdit',
   // Cursor models permission gating through `preToolUse` (the script returns
   // `{ "permission": "allow|deny|ask" }`). aix maps both `permission_request` and the
   // generic `pre_tool_use` to `preToolUse`. Editors that have a dedicated event keep
   // their richer mapping; on Cursor both fire on the same event.
   permission_request: 'preToolUse',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/**
 * Cursor command hooks accept `command`, `type`, `timeout`, `matcher`, `failClosed`,
 * `loop_limit`, `prompt`, and `model`. `bash` is silently promoted to `command` for
 * cross-platform portability, so it is recognized too. Every other action field is
 * dropped and reported via `getUnsupportedFields`.
 */
const CURSOR_RECOGNIZED_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'timeout',
   'fail_closed',
   'loop_limit',
   'prompt',
   'model',
   'description',
   'name',
]);

interface CursorCommandEntry {
   command: string;
   type?: 'command';
   matcher?: string;
   timeout?: number;
   failClosed?: boolean;
   loop_limit?: number | null;
}

interface CursorPromptEntry {
   type: 'prompt';
   prompt: string;
   matcher?: string;
   timeout?: number;
   model?: string;
   failClosed?: boolean;
   loop_limit?: number | null;
}

type CursorEntry = CursorCommandEntry | CursorPromptEntry;

function buildCursorEntry(action: HookAction, matcher: HookMatcher): CursorEntry | undefined {
   const type = action.type ?? 'command';

   if (type === 'prompt') {
      if (!action.prompt) {
         return undefined;
      }
      const entry: CursorPromptEntry = { type: 'prompt', prompt: action.prompt };

      if (matcher.matcher) {
         entry.matcher = matcher.matcher;
      }
      if (action.timeout !== undefined) {
         entry.timeout = action.timeout;
      }
      if (action.model !== undefined) {
         entry.model = action.model;
      }
      if (action.fail_closed) {
         entry.failClosed = true;
      }
      if (action.loop_limit !== undefined) {
         entry.loop_limit = action.loop_limit;
      }
      return entry;
   }

   const command = action.command ?? action.bash;

   if (!command) {
      return undefined;
   }

   const entry: CursorCommandEntry = { command };

   if (matcher.matcher) {
      entry.matcher = matcher.matcher;
   }
   if (action.timeout !== undefined) {
      entry.timeout = action.timeout;
   }
   if (action.fail_closed) {
      entry.failClosed = true;
   }
   if (action.loop_limit !== undefined) {
      entry.loop_limit = action.loop_limit;
   }
   return entry;
}

/**
 * Cursor hooks strategy. Writes hooks to `hooks.json` in the `.cursor` directory.
 * Translates generic ai.json event names to Cursor's camelCase format and wraps the
 * output with `version: 1`.
 */
export class CursorHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.cursor/hooks.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   getUnsupportedFields(hooks: HooksConfig): UnsupportedHookField[] {
      const result: UnsupportedHookField[] = [];

      for (const [ event, matchers ] of Object.entries(hooks)) {
         matchers?.forEach((matcher: HookMatcher, matcherIndex: number) => {
            matcher.hooks?.forEach((action, actionIndex) => {
               const fields: string[] = (Object.keys(action) as (keyof HookAction)[])
                  .filter((field) => !CURSOR_RECOGNIZED_FIELDS.has(field));

               if (event === 'post_response_with_transcript') {
                  fields.push('transcript_path');
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

   formatConfig(hooks: HooksConfig): string {
      const cursorHooks: Record<string, CursorEntry[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const cursorEvent = EVENT_MAP[event];

         if (!cursorEvent || !matchers) {
            continue;
         }

         const entries = matchers.flatMap((matcher: HookMatcher) =>
            matcher.hooks
               .map((action) => buildCursorEntry(action, matcher))
               .filter((entry): entry is CursorEntry => entry !== undefined),
         );

         if (entries.length === 0) {
            continue;
         }

         cursorHooks[cursorEvent] = (cursorHooks[cursorEvent] ?? []).concat(entries);
      }

      return JSON.stringify({ version: 1, hooks: cursorHooks }, null, 2) + '\n';
   }
}
