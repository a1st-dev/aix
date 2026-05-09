import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseHookObject, parseMatcherImportedHooks } from '../shared/hook-import-utils.js';

/**
 * Map from generic ai.json hook events to Claude Code's PascalCase event names.
 *
 * Claude Code groups several aix events under shared native events (`PreToolUse`,
 * `PostToolUse`); the reverse direction is handled by `TOOL_MATCHER_MAP`.
 */
const EVENT_MAP: Record<string, string> = {
   // Lifecycle.
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   setup: 'Setup',

   // Prompt.
   pre_prompt: 'UserPromptSubmit',
   user_prompt_expansion: 'UserPromptExpansion',

   // Tool use.
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   post_tool_use_failure: 'PostToolUseFailure',
   post_tool_batch: 'PostToolBatch',
   permission_request: 'PermissionRequest',
   permission_denied: 'PermissionDenied',
   pre_file_read: 'PreToolUse',
   post_file_read: 'PostToolUse',
   pre_file_write: 'PreToolUse',
   post_file_write: 'PostToolUse',
   pre_command: 'PreToolUse',
   post_command: 'PostToolUse',
   pre_mcp_tool: 'PreToolUse',
   post_mcp_tool: 'PostToolUse',

   // Agent / response.
   agent_stop: 'Stop',
   subagent_start: 'SubagentStart',
   subagent_stop: 'SubagentStop',
   subagent_idle: 'TeammateIdle',
   // Note: Claude Code's `StopFailure` only fires when a Stop hook fails; it is not a
   // general-purpose error event. aix's `error_occurred` therefore goes into
   // `getUnsupportedEvents` for this editor instead of being silently mapped to
   // something with narrower semantics.

   // System / context.
   pre_compact: 'PreCompact',
   post_compact: 'PostCompact',
   task_created: 'TaskCreated',
   task_completed: 'TaskCompleted',
   worktree_setup: 'WorktreeCreate',
   worktree_remove: 'WorktreeRemove',
   notification: 'Notification',
   instructions_loaded: 'InstructionsLoaded',
   config_change: 'ConfigChange',
   cwd_changed: 'CwdChanged',
   file_changed: 'FileChanged',
   elicitation: 'Elicitation',
   elicitation_result: 'ElicitationResult',
};

/**
 * Tool-name matchers to inject for events that target a specific Claude Code tool.
 * Events not listed here use the user-supplied matcher (or empty string for all tools).
 */
const TOOL_MATCHER_MAP: Record<string, string> = {
   pre_command: 'Bash',
   post_command: 'Bash',
   pre_file_read: 'Read',
   post_file_read: 'Read',
   pre_file_write: 'Write|Edit',
   post_file_write: 'Write|Edit',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/**
 * Per-action fields Claude Code does not surface natively. These are reported via
 * `getUnsupportedFields` so the install command can warn the user.
 */
const UNSUPPORTED_ACTION_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'show_output',
   'working_directory',
   'cwd',
   'env',
   'description',
   'name',
   'fail_closed',
   'loop_limit',
]);

interface ClaudeCommandHookEntry {
   type: 'command';
   command: string;
   timeout?: number;
   async?: boolean;
   asyncRewake?: boolean;
   shell?: 'bash' | 'powershell';
   if?: string;
   statusMessage?: string;
   once?: boolean;
}

interface ClaudeHttpHookEntry {
   type: 'http';
   url: string;
   timeout?: number;
   headers?: Record<string, string>;
   allowedEnvVars?: string[];
}

interface ClaudeMcpToolHookEntry {
   type: 'mcp_tool';
   server: string;
   tool: string;
   input?: Record<string, unknown>;
   timeout?: number;
}

interface ClaudePromptOrAgentHookEntry {
   type: 'prompt' | 'agent';
   prompt: string;
   model?: string;
   timeout?: number;
}

type ClaudeHookEntry =
   | ClaudeCommandHookEntry
   | ClaudeHttpHookEntry
   | ClaudeMcpToolHookEntry
   | ClaudePromptOrAgentHookEntry;

interface ClaudeMatcherGroup {
   matcher: string;
   hooks: ClaudeHookEntry[];
}

function pickCommand(action: HookAction, shell: 'bash' | 'powershell' | undefined): string | undefined {
   if (shell === 'powershell') {
      return action.powershell ?? action.command;
   }
   return action.command ?? action.bash ?? action.powershell;
}

function commandEntry(action: HookAction, shell: 'bash' | 'powershell' | undefined): ClaudeCommandHookEntry | undefined {
   const command = pickCommand(action, shell);

   if (!command) {
      return undefined;
   }

   const entry: ClaudeCommandHookEntry = { type: 'command', command };

   if (action.timeout !== undefined) {
      entry.timeout = action.timeout;
   }
   if (action.async) {
      entry.async = true;
   }
   if (action.async_rewake) {
      entry.asyncRewake = true;
   }
   if (shell !== undefined) {
      entry.shell = shell;
   } else if (action.shell) {
      entry.shell = action.shell;
   }
   if (action.if) {
      entry.if = action.if;
   }
   if (action.status_message !== undefined) {
      entry.statusMessage = action.status_message;
   }
   if (action.once !== undefined) {
      entry.once = action.once;
   }

   return entry;
}

function claudeEntriesFromAction(action: HookAction): ClaudeHookEntry[] {
   const type = action.type ?? 'command';

   if (type === 'http') {
      if (!action.url) {
         return [];
      }
      const entry: ClaudeHttpHookEntry = { type: 'http', url: action.url };

      if (action.headers !== undefined) {
         entry.headers = action.headers;
      }
      if (action.allowed_env_vars !== undefined) {
         entry.allowedEnvVars = action.allowed_env_vars;
      }
      if (action.timeout !== undefined) {
         entry.timeout = action.timeout;
      }
      return [entry];
   }

   if (type === 'mcp_tool') {
      if (!action.mcp_server || !action.mcp_tool) {
         return [];
      }
      const entry: ClaudeMcpToolHookEntry = {
         type: 'mcp_tool',
         server: action.mcp_server,
         tool: action.mcp_tool,
      };

      if (action.mcp_input !== undefined) {
         entry.input = action.mcp_input;
      }
      if (action.timeout !== undefined) {
         entry.timeout = action.timeout;
      }
      return [entry];
   }

   if (type === 'prompt' || type === 'agent') {
      if (!action.prompt) {
         return [];
      }
      const entry: ClaudePromptOrAgentHookEntry = { type, prompt: action.prompt };

      if (action.model !== undefined) {
         entry.model = action.model;
      }
      if (action.timeout !== undefined) {
         entry.timeout = action.timeout;
      }
      return [entry];
   }

   const hasBash = Boolean(action.bash) && action.shell !== 'powershell',
         hasPowershell = Boolean(action.powershell) && action.shell !== 'bash';

   if (hasBash && hasPowershell) {
      const bashAction: HookAction = { ...action, command: action.bash, powershell: undefined },
            powershellAction: HookAction = { ...action, command: action.powershell, bash: undefined };
      const bash = commandEntry(bashAction, 'bash'),
            powershell = commandEntry(powershellAction, 'powershell');

      return [...(bash ? [ bash ] : []), ...(powershell ? [ powershell ] : [])];
   }

   const inferredShell = action.shell
      ?? (action.powershell && !action.command && !action.bash ? 'powershell' : undefined);
   const single = commandEntry(action, inferredShell);

   return single ? [ single ] : [];
}

function parseClaudeHookAction(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>;

   if (entry.type === 'http') {
      if (typeof entry.url !== 'string' || entry.url.length === 0) {
         return null;
      }

      const action: HookAction = {
         type: 'http',
         url: entry.url,
      };

      if (typeof entry.timeout === 'number' && entry.timeout > 0) {
         action.timeout = entry.timeout;
      }
      if (isStringRecord(entry.headers)) {
         action.headers = entry.headers;
      }
      if (Array.isArray(entry.allowedEnvVars)) {
         action.allowed_env_vars = entry.allowedEnvVars.map(String);
      }

      return action;
   }

   if (entry.type === 'mcp_tool') {
      if (typeof entry.server !== 'string' || typeof entry.tool !== 'string') {
         return null;
      }

      const action: HookAction = {
         type: 'mcp_tool',
         mcp_server: entry.server,
         mcp_tool: entry.tool,
      };

      if (typeof entry.timeout === 'number' && entry.timeout > 0) {
         action.timeout = entry.timeout;
      }
      if (entry.input && typeof entry.input === 'object') {
         action.mcp_input = entry.input as Record<string, unknown>;
      }

      return action;
   }

   if (entry.type === 'prompt' || entry.type === 'agent') {
      if (typeof entry.prompt !== 'string' || entry.prompt.length === 0) {
         return null;
      }

      const action: HookAction = {
         type: entry.type,
         prompt: entry.prompt,
      };

      if (typeof entry.model === 'string' && entry.model.length > 0) {
         action.model = entry.model;
      }
      if (typeof entry.timeout === 'number' && entry.timeout > 0) {
         action.timeout = entry.timeout;
      }

      return action;
   }

   if (typeof entry.command !== 'string' || entry.command.length === 0) {
      return null;
   }

   const action: HookAction = { command: entry.command };

   if (typeof entry.timeout === 'number' && entry.timeout > 0) {
      action.timeout = entry.timeout;
   }
   if (entry.async === true) {
      action.async = true;
   }
   if (entry.asyncRewake === true) {
      action.async_rewake = true;
   }
   if (entry.shell === 'bash' || entry.shell === 'powershell') {
      action.shell = entry.shell;
   }
   if (typeof entry.if === 'string' && entry.if.length > 0) {
      action.if = entry.if;
   }
   if (typeof entry.statusMessage === 'string') {
      action.status_message = entry.statusMessage;
   }
   if (typeof entry.once === 'boolean') {
      action.once = entry.once;
   }

   return action;
}

function isStringRecord(value: unknown): value is Record<string, string> {
   if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
   }

   return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Claude Code hooks strategy. Writes hooks to `settings.json` in the `.claude` directory.
 * Translates generic ai.json event names to Claude Code's PascalCase format.
 */
export class ClaudeCodeHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getGlobalConfigPath(): string {
      return '.claude/settings.json';
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
                  .filter((field) => UNSUPPORTED_ACTION_FIELDS.has(field));

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
            parseAction: parseClaudeHookAction,
            toolMatchers: TOOL_MATCHER_MAP,
         }),
         warnings: parsed.warnings,
      };
   }

   formatConfig(hooks: HooksConfig): string {
      const claudeHooks: Record<string, ClaudeMatcherGroup[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const claudeEvent = EVENT_MAP[event];

         if (!claudeEvent || !matchers) {
            continue;
         }

         const toolMatcher = TOOL_MATCHER_MAP[event];
         const mapped: ClaudeMatcherGroup[] = matchers.map((matcher: HookMatcher) => ({
            matcher: toolMatcher ?? matcher.matcher ?? '',
            hooks: matcher.hooks.flatMap((action) => claudeEntriesFromAction(action)),
         }));

         claudeHooks[claudeEvent] = (claudeHooks[claudeEvent] ?? []).concat(mapped);
      }

      return JSON.stringify({ hooks: claudeHooks }, null, 2) + '\n';
   }
}
