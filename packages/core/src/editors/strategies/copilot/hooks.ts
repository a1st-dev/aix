import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, UnsupportedHookField } from '../types.js';

/**
 * Map from generic ai.json hook events to GitHub Copilot CLI's camelCase event names.
 * Source: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-hooks-reference
 */
const EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'preToolUse',
   post_tool_use: 'postToolUse',
   post_tool_use_failure: 'postToolUseFailure',
   pre_file_read: 'preToolUse',
   post_file_read: 'postToolUse',
   pre_file_write: 'preToolUse',
   post_file_write: 'postToolUse',
   pre_command: 'preToolUse',
   post_command: 'postToolUse',
   pre_mcp_tool: 'preToolUse',
   post_mcp_tool: 'postToolUse',
   permission_request: 'permissionRequest',
   notification: 'notification',
   session_start: 'sessionStart',
   session_end: 'sessionEnd',
   agent_stop: 'agentStop',
   pre_prompt: 'userPromptSubmitted',
   pre_compact: 'preCompact',
   subagent_start: 'subagentStart',
   subagent_stop: 'subagentStop',
   error_occurred: 'errorOccurred',
};

/**
 * Tool-name matchers for Copilot CLI's tool registry. Tool names taken from the docs:
 * `ask_user`, `bash`, `create`, `edit`, `glob`, `grep`, `powershell`, `task`, `view`,
 * `web_fetch`.
 */
const TOOL_MATCHER_MAP: Record<string, string> = {
   pre_command: 'bash|powershell',
   post_command: 'bash|powershell',
   pre_file_read: 'view',
   post_file_read: 'view',
   pre_file_write: 'create|edit',
   post_file_write: 'create|edit',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/** Fields the Copilot command hook entry surfaces natively. */
const COPILOT_COMMAND_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'powershell',
   'shell',
   'cwd',
   'working_directory',
   'env',
   'timeout',
   'description',
   'name',
]);

/** Fields the Copilot prompt hook entry (sessionStart only) surfaces natively. */
const COPILOT_PROMPT_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'prompt',
]);

interface CopilotCommandEntry {
   type: 'command';
   bash?: string;
   powershell?: string;
   cwd?: string;
   env?: Record<string, string>;
   timeoutSec?: number;
}

interface CopilotPromptEntry {
   type: 'prompt';
   prompt: string;
}

interface CopilotMatcherGroup {
   matcher: string;
   hooks: (CopilotCommandEntry | CopilotPromptEntry)[];
}

function buildCommandEntry(action: HookAction): CopilotCommandEntry | undefined {
   const useBash = action.shell !== 'powershell',
         useShell = action.shell !== 'bash',
         bash = useBash ? action.bash ?? (action.shell !== 'powershell' ? action.command : undefined) : undefined,
         powershell = useShell
            ? action.powershell ?? (action.shell === 'powershell' ? action.command : undefined)
            : undefined;

   if (!bash && !powershell) {
      return undefined;
   }

   const entry: CopilotCommandEntry = { type: 'command' };

   if (bash) {
      entry.bash = bash;
   }
   if (powershell) {
      entry.powershell = powershell;
   }

   const cwd = action.cwd ?? action.working_directory;

   if (cwd) {
      entry.cwd = cwd;
   }
   if (action.env) {
      entry.env = action.env;
   }
   if (action.timeout !== undefined) {
      entry.timeoutSec = action.timeout;
   }
   return entry;
}

function buildPromptEntry(action: HookAction): CopilotPromptEntry | undefined {
   if (!action.prompt) {
      return undefined;
   }
   return { type: 'prompt', prompt: action.prompt };
}

/**
 * GitHub Copilot CLI hooks strategy. Writes hooks to `.github/hooks/hooks.json` (project)
 * or `~/.copilot/hooks/hooks.json` (user). Wraps output with `version: 1`.
 */
export class CopilotHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      // Copilot hooks live in `.github/hooks/`, two levels up from `.vscode/`.
      return '../.github/hooks/hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.copilot/hooks/hooks.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   getUnsupportedFields(hooks: HooksConfig): UnsupportedHookField[] {
      const result: UnsupportedHookField[] = [];

      for (const [ event, matchers ] of Object.entries(hooks)) {
         matchers?.forEach((matcher: HookMatcher, matcherIndex: number) => {
            matcher.hooks?.forEach((action, actionIndex) => {
               const type = action.type ?? 'command';
               const recognized = type === 'prompt' ? COPILOT_PROMPT_FIELDS : COPILOT_COMMAND_FIELDS;
               const fields: string[] = (Object.keys(action) as (keyof HookAction)[])
                  .filter((field) => !recognized.has(field));

               if (type === 'prompt' && event !== 'session_start') {
                  fields.push('prompt');
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
      const copilotHooks: Record<string, CopilotMatcherGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const copilotEvent = EVENT_MAP[event];

         if (!copilotEvent || !matchers) {
            continue;
         }

         const toolMatcher = TOOL_MATCHER_MAP[event];
         const groups = matchers.map((matcher: HookMatcher) => {
            const entries: (CopilotCommandEntry | CopilotPromptEntry)[] = [];

            for (const action of matcher.hooks) {
               const type = action.type ?? 'command';

               if (type === 'prompt' && event === 'session_start') {
                  const prompt = buildPromptEntry(action);

                  if (prompt) {
                     entries.push(prompt);
                  }
                  continue;
               }
               if (type !== 'command') {
                  // Drop unsupported types; user is warned via getUnsupportedFields.
                  continue;
               }
               const command = buildCommandEntry(action);

               if (command) {
                  entries.push(command);
               }
            }

            return {
               matcher: toolMatcher ?? matcher.matcher ?? '',
               hooks: entries,
            };
         });

         const nonEmpty = groups.filter((group) => group.hooks.length > 0);

         if (nonEmpty.length === 0) {
            continue;
         }

         copilotHooks[copilotEvent] = (copilotHooks[copilotEvent] ?? []).concat(nonEmpty);
      }

      return JSON.stringify({ version: 1, hooks: copilotHooks }, null, 2) + '\n';
   }
}
