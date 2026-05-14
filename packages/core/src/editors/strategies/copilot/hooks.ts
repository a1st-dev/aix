import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

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

function parseCopilotAction(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>;

   if (entry.type === 'prompt') {
      if (typeof entry.prompt !== 'string' || entry.prompt.length === 0) {
         return null;
      }

      return {
         type: 'prompt',
         prompt: entry.prompt,
      };
   }

   const command = typeof entry.command === 'string' && entry.command.length > 0 ? entry.command : undefined,
         bash = typeof entry.bash === 'string' && entry.bash.length > 0 ? entry.bash : command,
         powershell =
            typeof entry.powershell === 'string' && entry.powershell.length > 0 ? entry.powershell : undefined;

   if (!bash && !powershell) {
      return null;
   }

   const action: HookAction = {};

   if (command) {
      action.command = command;
   } else if (bash) {
      action.bash = bash;
   }
   if (powershell) {
      action.powershell = powershell;
   }
   if (typeof entry.cwd === 'string' && entry.cwd.length > 0) {
      action.cwd = entry.cwd;
   }
   if (isStringRecord(entry.env)) {
      action.env = entry.env;
   }
   if (typeof entry.timeoutSec === 'number' && entry.timeoutSec > 0) {
      action.timeout = entry.timeoutSec;
   } else if (typeof entry.timeout === 'number' && entry.timeout > 0) {
      action.timeout = entry.timeout;
   }

   return action;
}

function normalizeImportedMatcher(matcher: string | undefined): string | undefined {
   switch (matcher) {
      case 'Bash':
         return 'bash|powershell';
      case 'Read':
         return 'view';
      case 'Write|Edit':
         return 'create|edit';
      default:
         return matcher;
   }
}

function normalizeImportedHookObject(rawHooks: Record<string, unknown>): Record<string, unknown> {
   if (rawHooks.stop !== undefined && rawHooks.agentStop === undefined) {
      return {
         ...rawHooks,
         agentStop: rawHooks.stop,
      };
   }

   return rawHooks;
}

function isStringRecord(value: unknown): value is Record<string, string> {
   if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
   }

   return Object.values(value).every((entry) => typeof entry === 'string');
}

import { getRuntimeAdapter } from '../../../runtime/index.js';

function getGlobalCopilotDir(): string {
   const platform = getRuntimeAdapter().os.platform();

   return platform === 'win32' ? 'AppData/Local/github-copilot' : '.config/github-copilot';
}

/**
 * GitHub Copilot CLI hooks strategy. Writes hooks to `.github/hooks/hooks.json` (project)
 * or `~/.config/github-copilot/hooks/hooks.json` (user). Wraps output with `version: 1`.
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
      return `${getGlobalCopilotDir()}/hooks/hooks.json`;
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

   parseImportedConfig(content: string): ParsedHooksImportResult {
      const parsed = parseHookObject(content);

      if (!parsed.rawHooks) {
         return { hooks: {}, warnings: parsed.warnings };
      }

      return {
         hooks: parseMatcherImportedHooks(normalizeImportedHookObject(parsed.rawHooks), {
            eventMap: EVENT_MAP,
            parseAction: parseCopilotAction,
            toolMatchers: TOOL_MATCHER_MAP,
            normalizeMatcher: normalizeImportedMatcher,
         }),
         warnings: parsed.warnings,
      };
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
