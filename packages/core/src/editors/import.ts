import { dirname, isAbsolute, join } from 'pathe';
import {
   createEmptyConfig,
   type HookEvent,
   parseJsonc,
   type AiJsonConfig,
   type HookAction,
   type HookMatcher,
   type HooksConfig,
   type McpServerConfig,
} from '@a1st/aix-schema';
import type { EditorName } from './types.js';
import type { McpStrategy, RulesStrategy, PromptsStrategy } from './strategies/types.js';
import type { NamedRule } from '../import-writer.js';
import { WindsurfRulesStrategy } from './strategies/windsurf/rules.js';
import { WindsurfPromptsStrategy } from './strategies/windsurf/prompts.js';
import { WindsurfMcpStrategy } from './strategies/windsurf/mcp.js';
import { StandardMcpStrategy } from './strategies/shared/standard-mcp.js';
import { CursorRulesStrategy } from './strategies/cursor/rules.js';
import { CursorPromptsStrategy } from './strategies/cursor/prompts.js';
import { ClaudeCodeMcpStrategy } from './strategies/claude-code/mcp.js';
import { ClaudeCodeRulesStrategy } from './strategies/claude-code/rules.js';
import { ClaudeCodePromptsStrategy } from './strategies/claude-code/prompts.js';
import { CopilotMcpStrategy } from './strategies/copilot/mcp.js';
import { CopilotRulesStrategy } from './strategies/copilot/rules.js';
import { CopilotPromptsStrategy } from './strategies/copilot/prompts.js';
import { ZedMcpStrategy } from './strategies/zed/mcp.js';
import { ZedRulesStrategy } from './strategies/zed/rules.js';
import { ZedPromptsStrategy } from './strategies/zed/prompts.js';
import { CodexRulesStrategy } from './strategies/codex/rules.js';
import { CodexPromptsStrategy } from './strategies/codex/prompts.js';
import { CodexMcpStrategy } from './strategies/codex/mcp.js';
import { GeminiRulesStrategy } from './strategies/gemini/rules.js';
import { GeminiPromptsStrategy } from './strategies/gemini/prompts.js';
import { GeminiMcpStrategy } from './strategies/gemini/mcp.js';
import { OpenCodeRulesStrategy } from './strategies/opencode/rules.js';
import { OpenCodePromptsStrategy } from './strategies/opencode/prompts.js';
import { OpenCodeMcpStrategy } from './strategies/opencode/mcp.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { getRuntimeAdapter, type RuntimeDirent } from '../runtime/index.js';

type ImportScope = 'project' | 'user';
export type ImportReadScope = ImportScope | 'all';

function existsSync(path: string): boolean {
   return getRuntimeAdapter().fs.existsSync(path);
}

function homedir(): string {
   return getRuntimeAdapter().os.homedir();
}

function assertGlobalHomeAccess(action: string): void {
   if (!getRuntimeAdapter().host.supportsGlobalHomeAccess()) {
      throw new UnsupportedRuntimeCapabilityError('global-home-access', action);
   }
}

function readFile(path: string, encoding: 'utf-8'): Promise<string> {
   return getRuntimeAdapter().fs.readFile(path, encoding);
}

function readdir(path: string): Promise<string[]>;
function readdir(path: string, options: { withFileTypes: true }): Promise<RuntimeDirent[]>;
function readdir(path: string, options?: { withFileTypes: true }): Promise<string[] | RuntimeDirent[]> {
   if (options) {
      return getRuntimeAdapter().fs.readdir(path, options);
   }
   return getRuntimeAdapter().fs.readdir(path);
}

export interface ImportResult {
   mcp: Record<string, McpServerConfig>;
   rules: NamedRule[];
   skills: Record<string, string>;
   prompts: Record<string, string>;
   hooks: HooksConfig;
   paths: {
      mcp: Record<string, string>;
      rules: Record<string, string>;
      skills: Record<string, string>;
      prompts: Record<string, string>;
      hooks: Record<string, string>;
   };
   scopes: {
      mcp: Record<string, ImportScope>;
      rules: Record<string, ImportScope>;
      skills: Record<string, ImportScope>;
      prompts: Record<string, ImportScope>;
      hooks: Record<string, ImportScope>;
   };
   warnings: string[];
   /** Sources that were found and imported from */
   sources: {
      global: boolean;
      local: boolean;
   };
}

export interface ImportOptions {
   /** Project root directory for local editor config lookup */
   projectRoot?: string;
   /** Which source scope to read. Defaults to 'all' for backward compatibility. */
   scope?: ImportReadScope;
}

export interface NormalizedImportedRule {
   name: string;
   sourceName: string;
   rawContent: string;
   content: string;
   description?: string;
   activation?: 'always' | 'auto' | 'glob' | 'manual';
   globs?: string[];
}

export interface NormalizedImportedPrompt {
   name: string;
   sourceName: string;
   rawContent: string;
   content: string;
   description?: string;
   argumentHint?: string;
}

export interface NormalizedImportedSkill {
   name: string;
   sourceName: string;
   ref: string;
}

export interface NormalizedEditorImport {
   mcp: ImportResult['mcp'];
   rules: NormalizedImportedRule[];
   prompts: NormalizedImportedPrompt[];
   skills: NormalizedImportedSkill[];
   hooks: HooksConfig;
}

interface ImportStrategies {
   mcp: McpStrategy;
   rules: RulesStrategy;
   prompts: PromptsStrategy;
}

type ImportedHookEvent = HookEvent;

const CURSOR_HOOK_EVENT_MAP: Record<string, string> = {
   session_start: 'sessionStart',
   session_end: 'sessionEnd',
   pre_tool_use: 'preToolUse',
   post_tool_use: 'postToolUse',
   pre_file_read: 'beforeReadFile',
   pre_command: 'beforeShellExecution',
   post_command: 'afterShellExecution',
   pre_mcp_tool: 'beforeMCPExecution',
   post_mcp_tool: 'afterMCPExecution',
   post_file_write: 'afterFileEdit',
   pre_prompt: 'beforeSubmitPrompt',
   agent_stop: 'stop',
};

const WINDSURF_HOOK_EVENT_MAP: Record<string, string> = {
   pre_file_read: 'pre_read_code',
   post_file_read: 'post_read_code',
   pre_file_write: 'pre_write_code',
   post_file_write: 'post_write_code',
   pre_command: 'pre_run_command',
   post_command: 'post_run_command',
   pre_mcp_tool: 'pre_mcp_tool_use',
   post_mcp_tool: 'post_mcp_tool_use',
   pre_prompt: 'pre_user_prompt',
   agent_stop: 'post_cascade_response',
   worktree_setup: 'post_setup_worktree',
};

const CLAUDE_CODE_HOOK_EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'PreToolUse',
   post_tool_use: 'PostToolUse',
   pre_file_read: 'PreToolUse',
   post_file_read: 'PostToolUse',
   pre_file_write: 'PreToolUse',
   post_file_write: 'PostToolUse',
   pre_command: 'PreToolUse',
   post_command: 'PostToolUse',
   pre_mcp_tool: 'PreToolUse',
   post_mcp_tool: 'PostToolUse',
   session_start: 'SessionStart',
   session_end: 'SessionEnd',
   agent_stop: 'Stop',
   pre_prompt: 'UserPromptSubmit',
   pre_compact: 'PreCompact',
   post_compact: 'PostCompact',
   subagent_start: 'SubagentStart',
   subagent_stop: 'SubagentStop',
   task_created: 'TaskCreated',
   task_completed: 'TaskCompleted',
   worktree_setup: 'WorktreeCreate',
};

const COPILOT_HOOK_EVENT_MAP: Record<string, string> = {
   pre_tool_use: 'preToolUse',
   post_tool_use: 'postToolUse',
   pre_file_read: 'preToolUse',
   post_file_read: 'postToolUse',
   pre_file_write: 'preToolUse',
   post_file_write: 'postToolUse',
   pre_command: 'preToolUse',
   post_command: 'postToolUse',
   pre_mcp_tool: 'preToolUse',
   post_mcp_tool: 'postToolUse',
   session_start: 'sessionStart',
   session_end: 'sessionEnd',
   agent_stop: 'stop',
   pre_prompt: 'userPromptSubmitted',
   pre_compact: 'preCompact',
   subagent_start: 'subagentStart',
   subagent_stop: 'subagentStop',
};

const CLAUDE_CODE_HOOK_TOOL_MATCHERS: Record<string, string> = {
   pre_command: 'Bash',
   post_command: 'Bash',
   pre_file_read: 'Read',
   post_file_read: 'Read',
   pre_file_write: 'Write|Edit',
   post_file_write: 'Write|Edit',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

const COPILOT_HOOK_TOOL_MATCHERS: Record<string, string> = {
   pre_command: 'Bash',
   post_command: 'Bash',
   pre_file_read: 'Read',
   post_file_read: 'Read',
   pre_file_write: 'Write|Edit',
   post_file_write: 'Write|Edit',
   pre_mcp_tool: 'mcp__.*',
   post_mcp_tool: 'mcp__.*',
};

/**
 * Get the import strategies for an editor.
 */
function getImportStrategies(editor: EditorName): ImportStrategies {
   switch (editor) {
      case 'windsurf':
         return {
            mcp: new WindsurfMcpStrategy(),
            rules: new WindsurfRulesStrategy(),
            prompts: new WindsurfPromptsStrategy(),
         };
      case 'cursor':
         return {
            mcp: new StandardMcpStrategy(),
            rules: new CursorRulesStrategy(),
            prompts: new CursorPromptsStrategy(),
         };
      case 'claude-code':
         return {
            mcp: new ClaudeCodeMcpStrategy(),
            rules: new ClaudeCodeRulesStrategy(),
            prompts: new ClaudeCodePromptsStrategy(),
         };
      case 'copilot':
         return {
            mcp: new CopilotMcpStrategy(),
            rules: new CopilotRulesStrategy(),
            prompts: new CopilotPromptsStrategy(),
         };
      case 'zed':
         return {
            mcp: new ZedMcpStrategy(),
            rules: new ZedRulesStrategy(),
            prompts: new ZedPromptsStrategy(),
         };
      case 'codex':
         return {
            mcp: new CodexMcpStrategy(),
            rules: new CodexRulesStrategy(),
            prompts: new CodexPromptsStrategy(),
         };
      case 'gemini':
         return {
            mcp: new GeminiMcpStrategy(),
            rules: new GeminiRulesStrategy(),
            prompts: new GeminiPromptsStrategy(),
         };
      case 'opencode':
         return {
            mcp: new OpenCodeMcpStrategy(),
            rules: new OpenCodeRulesStrategy(),
            prompts: new OpenCodePromptsStrategy(),
         };
   }
}

/**
 * Import configuration from an editor and convert to ai.json format.
 * Merges global config with project-local editor config: Object.assign({}, global, local)
 *
 * @param editor - The editor to import from
 * @param options - Import options including projectRoot for local config lookup
 */
export async function importFromEditor(
   editor: EditorName,
   options: ImportOptions = {},
): Promise<ImportResult> {
   const result: ImportResult = {
            mcp: {},
            rules: [],
            skills: {},
            prompts: {},
            hooks: {},
            paths: { mcp: {}, rules: {}, skills: {}, prompts: {}, hooks: {} },
            scopes: { mcp: {}, rules: {}, skills: {}, prompts: {}, hooks: {} },
            warnings: [],
            sources: { global: false, local: false },
         },
         strategies = getImportStrategies(editor),
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         scope = options.scope ?? 'all';

   if (scope === 'all' || scope === 'user') {
      assertGlobalHomeAccess(`importing global ${editor} configuration`);
      mergeImportMcp(result, await importMcpConfig(strategies.mcp, editor, 'global'));
      mergeImportRules(result, await importGlobalRules(strategies.rules, editor));
      mergeImportPrompts(result, await importPrompts(strategies.prompts, editor, 'global'));
      mergeImportSkills(result, await importGlobalSkills(editor));
      mergeImportHooks(result, await importHooks(editor, 'global'));
   }

   if (scope === 'all' || scope === 'project') {
      mergeImportMcp(result, await importLocalMcpConfig(strategies.mcp, editor, projectRoot));
      mergeImportRules(result, await importLocalRules(strategies.rules, editor, projectRoot));
      mergeImportPrompts(result, await importLocalPrompts(strategies.prompts, editor, projectRoot));
      mergeImportSkills(result, await importLocalSkills(editor, projectRoot));
      mergeImportHooks(result, await importHooks(editor, 'project', projectRoot));
   }

   return result;
}

function mergeImportMcp(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importMcpConfig>>,
): void {
   if (Object.keys(imported.mcp).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.mcp, imported.mcp);
   Object.assign(result.paths.mcp, imported.paths);
   Object.assign(result.scopes.mcp, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportRules(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importGlobalRules>>,
): void {
   if (imported.rules.length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   result.rules.push(...imported.rules);
   Object.assign(result.paths.rules, imported.paths);
   Object.assign(result.scopes.rules, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportPrompts(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importPrompts>>,
): void {
   if (Object.keys(imported.prompts).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.prompts, imported.prompts);
   Object.assign(result.paths.prompts, imported.paths);
   Object.assign(result.scopes.prompts, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportSkills(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importGlobalSkills>>,
): void {
   if (Object.keys(imported.skills).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.skills, imported.skills);
   Object.assign(result.paths.skills, imported.paths);
   Object.assign(result.scopes.skills, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportHooks(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importHooks>>,
): void {
   if (Object.keys(imported.hooks).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.hooks, imported.hooks);
   Object.assign(result.paths.hooks, imported.paths);
   Object.assign(result.scopes.hooks, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function sanitizeImportedName(name: string): string {
   return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'imported-item';
}

function dedupeImportedName(name: string, used: Set<string>): string {
   const baseName = sanitizeImportedName(name);
   let candidate = baseName,
       index = 1;

   while (used.has(candidate)) {
      candidate = `${baseName}-${index}`;
      index += 1;
   }

   used.add(candidate);
   return candidate;
}

function normalizeImportedRule(
   strategy: RulesStrategy,
   rule: ImportResult['rules'][number],
   usedNames: Set<string>,
): NormalizedImportedRule {
   const normalized: NormalizedImportedRule = {
      name: dedupeImportedName(rule.name, usedNames),
      sourceName: rule.name,
      rawContent: rule.content,
      content: rule.content,
   };

   if (!strategy.parseFrontmatter) {
      return normalized;
   }

   const parsed = strategy.parseFrontmatter(rule.content);

   normalized.content = parsed.content;
   normalized.description = parsed.metadata.description;
   normalized.activation = parsed.metadata.activation;
   normalized.globs = parsed.metadata.globs;

   return normalized;
}

function normalizeImportedPrompt(
   strategy: PromptsStrategy,
   [sourceName, rawContent]: [string, string],
   usedNames: Set<string>,
): NormalizedImportedPrompt {
   const normalized: NormalizedImportedPrompt = {
      name: dedupeImportedName(sourceName, usedNames),
      sourceName,
      rawContent,
      content: rawContent,
   };

   if (!strategy.parseFrontmatter) {
      return normalized;
   }

   const parsed = strategy.parseFrontmatter(rawContent);

   normalized.content = parsed.content;
   normalized.description = parsed.description;
   normalized.argumentHint = Array.isArray(parsed.argumentHint)
      ? parsed.argumentHint.join(', ')
      : parsed.argumentHint;

   return normalized;
}

/**
 * Convert imported editor content into normalized aix data that can be written to ai.json or
 * passed through another editor adapter.
 */
export function normalizeEditorImport(
   editor: EditorName,
   result: ImportResult,
): NormalizedEditorImport {
   const strategies = getImportStrategies(editor),
         usedRuleNames = new Set<string>(),
         usedPromptNames = new Set<string>(),
         usedSkillNames = new Set<string>();

   return {
      mcp: result.mcp,
      rules: result.rules.map((rule) => normalizeImportedRule(strategies.rules, rule, usedRuleNames)),
      prompts: Object.entries(result.prompts).map((entry) => normalizeImportedPrompt(strategies.prompts, entry, usedPromptNames)),
      skills: Object.entries(result.skills).map(([sourceName, ref]) => ({
         name: dedupeImportedName(sourceName, usedSkillNames),
         sourceName,
         ref,
      })),
      hooks: result.hooks,
   };
}

/**
 * Build an ai.json-shaped config object from imported editor content. This is the bridge used by
 * `aix init --from` and `aix sync`, so editor-to-editor sync does not require a custom
 * converter for every source/destination pair.
 */
export function buildConfigFromEditorImport(
   editor: EditorName,
   result: ImportResult,
): AiJsonConfig {
   const normalized = normalizeEditorImport(editor, result),
         config = createEmptyConfig();

   config.mcp = normalized.mcp;
   config.rules = Object.fromEntries(
      normalized.rules.map((rule) => {
         const value: Record<string, unknown> = {
            content: rule.content,
         };

         if (rule.description) {
            value.description = rule.description;
         }
         if (rule.activation) {
            value.activation = rule.activation;
         }
         if (rule.globs && rule.globs.length > 0) {
            value.globs = rule.globs;
         }

         return [rule.name, value];
      }),
   );
   config.prompts = Object.fromEntries(
      normalized.prompts.map((prompt) => {
         const value: Record<string, unknown> = {
            content: prompt.content,
         };

         if (prompt.description) {
            value.description = prompt.description;
         }
         if (prompt.argumentHint) {
            value.argumentHint = prompt.argumentHint;
         }

         return [prompt.name, value];
      }),
   );
   config.skills = Object.fromEntries(normalized.skills.map((skill) => [skill.name, skill.ref]));

   if (Object.keys(normalized.hooks).length > 0) {
      config.hooks = normalized.hooks;
   }

   return config;
}

function getHookEventMap(editor: EditorName): Record<string, string> | null {
   switch (editor) {
      case 'cursor':
         return CURSOR_HOOK_EVENT_MAP;
      case 'windsurf':
         return WINDSURF_HOOK_EVENT_MAP;
      case 'claude-code':
         return CLAUDE_CODE_HOOK_EVENT_MAP;
      case 'copilot':
         return COPILOT_HOOK_EVENT_MAP;
      default:
         return null;
   }
}

function getHookToolMatcherMap(editor: EditorName): Record<string, string> {
   switch (editor) {
      case 'claude-code':
         return CLAUDE_CODE_HOOK_TOOL_MATCHERS;
      case 'copilot':
         return COPILOT_HOOK_TOOL_MATCHERS;
      default:
         return {};
   }
}

function getHookConfigPath(editor: EditorName, projectRoot: string | undefined, source: 'global' | 'project'): string | null {
   if (editor === 'copilot' && source === 'global') {
      return join(homedir(), '.copilot/hooks/hooks.json');
   }

   const configDir = EDITOR_CONFIG_DIRS[editor],
         hooksPath = getHooksConfigPathRelative(editor);

   if (!hooksPath) {
      return null;
   }

   switch (source) {
      case 'global':
         return join(homedir(), configDir, hooksPath);
      case 'project':
         if (!projectRoot) {
            return null;
         }
         return join(projectRoot, configDir, hooksPath);
   }
}

function getHooksConfigPathRelative(editor: EditorName): string | null {
   switch (editor) {
      case 'cursor':
         return 'hooks.json';
      case 'windsurf':
         return 'hooks.json';
      case 'claude-code':
         return 'settings.json';
      case 'copilot':
         return '../.github/hooks/hooks.json';
      default:
         return null;
   }
}

function parseHookAction(value: unknown): HookAction | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const hook = value as Record<string, unknown>;

   if (typeof hook.command !== 'string' || hook.command.length === 0) {
      return null;
   }

   const action: HookAction = {
      command: hook.command,
   };

   if (typeof hook.timeout === 'number' && hook.timeout > 0) {
      action.timeout = hook.timeout;
   }
   if (typeof hook.show_output === 'boolean') {
      action.show_output = hook.show_output;
   }
   if (typeof hook.working_directory === 'string' && hook.working_directory.length > 0) {
      action.working_directory = hook.working_directory;
   }

   return action;
}

function normalizeImportedMatcher(
   event: string,
   matcher: string | undefined,
   toolMatchers: Record<string, string>,
): string | undefined {
   if (!matcher) {
      return undefined;
   }

   return toolMatchers[event] === matcher ? undefined : matcher;
}

function pushImportedMatchers(
   hooks: HooksConfig,
   event: ImportedHookEvent,
   matchers: HookMatcher[],
): void {
   if (matchers.length === 0) {
      return;
   }

   hooks[event] = [ ...(hooks[event] ?? []), ...matchers ];
}

function parseFlatHookEntries(
   rawHooks: Record<string, unknown>,
   eventMap: Record<string, string>,
): HooksConfig {
   const hooks: HooksConfig = {},
         reverseEventMap: Record<string, ImportedHookEvent> = {};

   for (const [event, nativeEvent] of Object.entries(eventMap)) {
      reverseEventMap[nativeEvent] = event as ImportedHookEvent;
   }

   for (const [nativeEvent, rawActions] of Object.entries(rawHooks)) {
      const event = reverseEventMap[nativeEvent];

      if (!event || !Array.isArray(rawActions)) {
         continue;
      }

      const actions = rawActions
         .map((action) => parseHookAction(action))
         .filter((action): action is HookAction => action !== null);

      pushImportedMatchers(hooks, event, [{ hooks: actions }]);
   }

   return hooks;
}

function resolveMatcherBackedEvent(
   nativeEvent: string,
   matcher: string | undefined,
   eventMap: Record<string, string>,
   toolMatchers: Record<string, string>,
) : ImportedHookEvent | null {
   const matchingEvents = Object.entries(eventMap)
      .filter(([, mappedEvent]) => mappedEvent === nativeEvent)
      .map(([event]) => event as ImportedHookEvent);

   if (matchingEvents.length === 0) {
      return null;
   }

   for (const event of matchingEvents) {
      if (toolMatchers[event] === matcher) {
         return event;
      }
   }

   return matchingEvents.find((event) => !toolMatchers[event]) ?? matchingEvents[0] ?? null;
}

function parseMatcherHookEntries(
   rawHooks: Record<string, unknown>,
   eventMap: Record<string, string>,
   toolMatchers: Record<string, string>,
): HooksConfig {
   const hooks: HooksConfig = {};

   for (const [nativeEvent, rawMatchers] of Object.entries(rawHooks)) {
      if (!Array.isArray(rawMatchers)) {
         continue;
      }

      for (const rawMatcher of rawMatchers) {
         if (!rawMatcher || typeof rawMatcher !== 'object') {
            continue;
         }

         const matcherValue = rawMatcher as Record<string, unknown>,
               event = resolveMatcherBackedEvent(
                  nativeEvent,
                  typeof matcherValue.matcher === 'string' ? matcherValue.matcher : undefined,
                  eventMap,
                  toolMatchers,
               );

         if (!event || !Array.isArray(matcherValue.hooks)) {
            continue;
         }

         const actions = matcherValue.hooks
            .map((action) => parseHookAction(action))
            .filter((action): action is HookAction => action !== null);

         pushImportedMatchers(hooks, event, [{
            ...(normalizeImportedMatcher(
               event,
               typeof matcherValue.matcher === 'string' ? matcherValue.matcher : undefined,
               toolMatchers,
            ) && {
               matcher: normalizeImportedMatcher(
                  event,
                  typeof matcherValue.matcher === 'string' ? matcherValue.matcher : undefined,
                  toolMatchers,
               ),
            }),
            hooks: actions,
         }]);
      }
   }

   return hooks;
}

function parseImportedHooks(editor: EditorName, content: string): {
   hooks: HooksConfig;
   warnings: string[];
} {
   const eventMap = getHookEventMap(editor);

   if (!eventMap) {
      return { hooks: {}, warnings: [] };
   }

   const parsed = parseJsonc<{ hooks?: Record<string, unknown> }>(content),
         warnings = parsed.errors.map((error) => `Failed to parse hooks config: ${error.message}`),
         rawHooks = parsed.data?.hooks;

   if (!rawHooks || typeof rawHooks !== 'object') {
      return { hooks: {}, warnings };
   }

   const toolMatchers = getHookToolMatcherMap(editor),
         hooks = editor === 'cursor' || editor === 'windsurf'
            ? parseFlatHookEntries(rawHooks, eventMap)
            : parseMatcherHookEntries(rawHooks, eventMap, toolMatchers);

   return { hooks, warnings };
}

async function importHooks(
   editor: EditorName,
   source: 'global' | 'project',
   projectRoot?: string,
): Promise<{
   hooks: HooksConfig;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const configPath = getHookConfigPath(editor, projectRoot, source);

   if (!configPath) {
      return { hooks: {}, paths: {}, scopes: {}, warnings: [] };
   }

   try {
      const content = await readFile(configPath, 'utf-8'),
            parsed = parseImportedHooks(editor, content),
            scope = source === 'global' ? 'user' : 'project',
            eventNames = Object.keys(parsed.hooks);

      return {
         hooks: parsed.hooks,
         paths: pathMapForNames(eventNames, configPath),
         scopes: scopeMapForNames(eventNames, scope),
         warnings: parsed.warnings,
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return { hooks: {}, paths: {}, scopes: {}, warnings: [] };
      }

      return {
         hooks: {},
         paths: {},
         scopes: {},
         warnings: [`Failed to read hooks config at ${configPath}: ${(err as Error).message}`],
      };
   }
}

/** Editor config directory names */
const EDITOR_CONFIG_DIRS: Record<EditorName, string> = {
   windsurf: '.windsurf',
   cursor: '.cursor',
   'claude-code': '.claude',
   copilot: '.vscode',
   zed: '.zed',
   codex: '.codex',
   gemini: '.gemini',
   opencode: '.opencode',
};

const EDITOR_SKILL_DIRS: Record<EditorName, string[]> = {
   windsurf: ['.windsurf/skills'],
   cursor: ['.cursor/skills'],
   'claude-code': ['.claude/skills'],
   copilot: ['.github/skills'],
   zed: ['.aix/skills'],
   codex: ['.agents/skills'],
   gemini: ['.gemini/skills'],
   opencode: ['.opencode/skills'],
};

const EDITOR_GLOBAL_RULE_DIRS: Partial<Record<EditorName, string[]>> = {
   'claude-code': ['.claude/rules'],
};

const EDITOR_GLOBAL_SKILL_DIRS: Partial<Record<EditorName, string[]>> = {
   windsurf: ['.windsurf/skills'],
   cursor: ['.cursor/skills'],
   'claude-code': ['.claude/skills'],
   copilot: ['.copilot/skills'],
   codex: ['.codex/skills'],
   gemini: ['.gemini/skills'],
   opencode: ['.config/opencode/skills'],
};

/**
 * Import MCP configuration from an editor's global config.
 */
async function importMcpConfig(
   strategy: McpStrategy,
   editor: EditorName,
   _source: 'global',
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         configPath = strategy.getGlobalMcpConfigPath();

   if (!configPath) {
      // Not a warning - some editors don't have global MCP config
      return { mcp: {}, paths: {}, scopes: {}, warnings };
   }

   const fullPath = editor === 'opencode'
      ? resolveOpenCodeConfigPath(join(homedir(), configPath))
      : join(homedir(), configPath);

   try {
      const content = await readFile(fullPath, 'utf-8'),
            result = strategy.parseGlobalMcpConfig(content);

      return {
         ...result,
         paths: pathMapForNames(Object.keys(result.mcp), fullPath),
         scopes: scopeMapForNames(Object.keys(result.mcp), 'user'),
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(
            `Failed to read global MCP config at ${fullPath}: ${(err as Error).message}`,
         );
      }
   }

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import MCP configuration from project-local editor config.
 */
async function importLocalMcpConfig(
   strategy: McpStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [];

   // Skip if MCP is not supported for project-local config (e.g., global-only editors)
   if (!strategy.isSupported() || strategy.isGlobalOnly?.()) {
      return { mcp: {}, paths: {}, scopes: {}, warnings };
   }

   for (const fullPath of getLocalMcpImportPaths(strategy, editor, projectRoot)) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await readFile(fullPath, 'utf-8'),
               result = strategy.parseGlobalMcpConfig(content);

         return {
            ...result,
            paths: pathMapForNames(Object.keys(result.mcp), fullPath),
            scopes: scopeMapForNames(Object.keys(result.mcp), 'project'),
         };
      } catch (err) {
         if (
            (err as NodeJS.ErrnoException).code !== 'ENOENT' &&
            (err as NodeJS.ErrnoException).code !== 'EISDIR'
         ) {
            warnings.push(`Failed to read local MCP config at ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

function getLocalMcpImportPaths(strategy: McpStrategy, editor: EditorName, projectRoot: string): string[] {
   const configDir = EDITOR_CONFIG_DIRS[editor],
         mcpConfigPath = strategy.getConfigPath(),
         baseDir = strategy.isProjectRootConfig?.() ? projectRoot : join(projectRoot, configDir),
         primaryPath = editor === 'opencode'
            ? resolveOpenCodeConfigPath(join(baseDir, mcpConfigPath))
            : join(baseDir, mcpConfigPath);

   if (editor !== 'copilot') {
      return [primaryPath];
   }

   return [
      primaryPath,
      join(projectRoot, '.github/mcp.json'),
   ];
}

/**
 * Import rules from an editor's global config. Tags each rule with the name 'global'.
 */
async function importGlobalRules(
   strategy: RulesStrategy,
   editor: EditorName,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         rulesPath = strategy.getGlobalRulesPath(),
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   if (rulesPath) {
      const fullPath = join(homedir(), rulesPath);

      try {
         const content = await readFile(fullPath, 'utf-8'),
               parsed = strategy.parseGlobalRules(content);

         for (const [index, rule] of parsed.rules.entries()) {
            const name = index === 0 ? 'global' : `global-${index + 1}`;

            rules.push({ content: rule, name, path: fullPath, scope: 'user' });
            paths[name] = fullPath;
            scopes[name] = 'user';
         }
         warnings.push(...parsed.warnings);
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global rules from ${fullPath}: ${(err as Error).message}`,
            );
         }
      }
   }

   if (editor === 'opencode') {
      const configPath = resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
            imported = await importOpenCodeInstructionRules(configPath, dirname(configPath), 'user');

      rules.push(...imported.rules);
      Object.assign(paths, imported.paths);
      Object.assign(scopes, imported.scopes);
      warnings.push(...imported.warnings);
   }

   const ruleDirs = EDITOR_GLOBAL_RULE_DIRS[editor] ?? [];

   for (const ruleDir of ruleDirs) {
      const fullPath = join(homedir(), ruleDir);

      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const files = await readdir(fullPath),
               ext = strategy.getFileExtension(),
               ruleFiles = files.filter((file) => file.endsWith(ext)).toSorted();

         for (const file of ruleFiles) {
            const path = join(fullPath, file),
                  name = file.slice(0, -ext.length);

            // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
            const rule = await readGlobalRuleFile(path, name, warnings);

            if (rule) {
               rules.push(rule);
               paths[name] = path;
               scopes[name] = 'user';
            }
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global rules from ${fullPath}: ${(err as Error).message}`,
            );
         }
      }
   }

   return { rules, paths, scopes, warnings };
}

async function readGlobalRuleFile(
   path: string,
   name: string,
   warnings: string[],
): Promise<NamedRule | undefined> {
   try {
      const content = await readFile(path, 'utf-8'),
            trimmed = content.trim();

      if (!trimmed) {
         return undefined;
      }

      return { content: trimmed, name, path, scope: 'user' };
   } catch (err) {
      warnings.push(`Failed to read global rule ${path}: ${(err as Error).message}`);
      return undefined;
   }
}

/**
 * Import rules from project-local editor config. Tags each rule with its filename (sans extension).
 */
async function importLocalRules(
   strategy: RulesStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   // Codex uses AGENTS.md at the project root (not inside .codex/), so use a dedicated reader
   if (editor === 'codex') {
      return importCodexLocalRules(projectRoot);
   }

   // Gemini uses GEMINI.md at the project root (not inside .gemini/), similar to Codex
   if (editor === 'gemini') {
      return importGeminiLocalRules(projectRoot);
   }

   if (editor === 'opencode') {
      return importOpenCodeLocalRules(projectRoot);
   }

   if (editor === 'zed') {
      return importZedLocalRules(projectRoot);
   }

   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         rulesDir = strategy.getRulesDir(),
         fullPath = join(projectRoot, configDir, rulesDir);

   try {
      const files = await readdir(fullPath),
            ext = strategy.getFileExtension(),
            ruleFiles = files.filter((f) => f.endsWith(ext)),
            rules: NamedRule[] = [],
            paths: Record<string, string> = {},
            scopes: Record<string, ImportScope> = {};

      for (const file of ruleFiles) {
         try {
            const path = join(fullPath, file);
            // eslint-disable-next-line no-await-in-loop -- Sequential for simplicity
            const content = await readFile(path, 'utf-8'),
                  name = file.endsWith(ext) ? file.slice(0, -ext.length) : file;

            rules.push({ content, name, path, scope: 'project' });
            paths[name] = path;
            scopes[name] = 'project';
         } catch {
            // Skip files that can't be read
         }
      }

      return { rules, paths, scopes, warnings };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local rules from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

async function importZedLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         rulesPath = join(projectRoot, '.rules');

   try {
      const content = await readFile(rulesPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               {
                  content: content.trim(),
                  name: 'project rules',
                  path: rulesPath,
                  scope: 'project',
               },
            ],
            paths: { 'project rules': rulesPath },
            scopes: { 'project rules': 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Zed rules from ${rulesPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

/**
 * Import Codex rules from AGENTS.md at the project root. Codex discovers one AGENTS.md per
 * directory from root→CWD, so we read the root file and tag it accordingly.
 */
async function importCodexLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         agentsPath = join(projectRoot, 'AGENTS.md');

   try {
      const content = await readFile(agentsPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               { content: content.trim(), name: 'AGENTS', path: agentsPath, scope: 'project' },
            ],
            paths: { AGENTS: agentsPath },
            scopes: { AGENTS: 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Codex rules from ${agentsPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

/**
 * Import Gemini rules from GEMINI.md at the project root. Gemini CLI reads GEMINI.md for
 * project-level context and instructions.
 */
async function importGeminiLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         geminiPath = join(projectRoot, 'GEMINI.md');

   try {
      const content = await readFile(geminiPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               { content: content.trim(), name: 'GEMINI', path: geminiPath, scope: 'project' },
            ],
            paths: { GEMINI: geminiPath },
            scopes: { GEMINI: 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Gemini rules from ${geminiPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

async function importOpenCodeLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         agentsPath = join(projectRoot, 'AGENTS.md'),
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   try {
      const content = await readFile(agentsPath, 'utf-8');

      if (content.trim()) {
         rules.push({ content: content.trim(), name: 'AGENTS', path: agentsPath, scope: 'project' });
         paths.AGENTS = agentsPath;
         scopes.AGENTS = 'project';
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read OpenCode rules from ${agentsPath}: ${(err as Error).message}`);
      }
   }

   const imported = await importOpenCodeInstructionRules(
      resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')),
      projectRoot,
      'project',
   );

   rules.push(...imported.rules);
   Object.assign(paths, imported.paths);
   Object.assign(scopes, imported.scopes);
   warnings.push(...imported.warnings);

   return { rules, paths, scopes, warnings };
}

/**
 * Import prompts/workflows from an editor's global config.
 */
async function importPrompts(
   strategy: PromptsStrategy,
   editor: EditorName,
   _source: 'global',
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         promptsPath = strategy.getGlobalPromptsPath();

   if (!promptsPath) {
      return { prompts: {}, paths: {}, scopes: {}, warnings };
   }

   const fullPath = join(homedir(), promptsPath);

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            },
            result = await strategy.parseGlobalPrompts(files, fileReader);

      const imported = {
         ...result,
         paths: promptPathMap(Object.keys(result.prompts), files, fullPath),
         scopes: scopeMapForNames(Object.keys(result.prompts), 'user'),
      };

      if (editor !== 'opencode') {
         return imported;
      }

      return mergePromptImports(
         await importOpenCodeConfigPrompts(
            resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
            'user',
         ),
         imported,
      );
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   if (editor === 'opencode') {
      return importOpenCodeConfigPrompts(
         resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
         'user',
      );
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import prompts/workflows from project-local editor config.
 */
async function importLocalPrompts(
   strategy: PromptsStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         promptsDir = strategy.getPromptsDir(),
         fullPath = join(projectRoot, configDir, promptsDir);

   if (!strategy.isSupported()) {
      return { prompts: {}, paths: {}, scopes: {}, warnings };
   }

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            },
            result = await strategy.parseGlobalPrompts(files, fileReader);

      const imported = {
         ...result,
         paths: promptPathMap(Object.keys(result.prompts), files, fullPath),
         scopes: scopeMapForNames(Object.keys(result.prompts), 'project'),
      };

      if (editor !== 'opencode') {
         return imported;
      }

      return mergePromptImports(
         await importOpenCodeConfigPrompts(resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')), 'project'),
         imported,
      );
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   if (editor === 'opencode') {
      return importOpenCodeConfigPrompts(resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')), 'project');
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

interface OpenCodeConfigCommand {
   template?: unknown;
   description?: unknown;
}

interface OpenCodeConfig {
   instructions?: unknown;
   command?: Record<string, OpenCodeConfigCommand>;
}

async function readOpenCodeConfig(configPath: string): Promise<OpenCodeConfig | null> {
   try {
      const parsed = parseJsonc<OpenCodeConfig>(await readFile(configPath, 'utf-8'));

      if (parsed.errors.length > 0 || !parsed.data) {
         throw new Error('invalid JSONC');
      }

      return parsed.data;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return null;
      }
      throw err;
   }
}

function resolveOpenCodeConfigPath(jsonPath: string): string {
   if (existsSync(jsonPath)) {
      return jsonPath;
   }

   const jsoncPath = jsonPath.replace(/\.json$/, '.jsonc');

   return existsSync(jsoncPath) ? jsoncPath : jsonPath;
}

async function importOpenCodeInstructionRules(
   configPath: string,
   baseDir: string,
   scope: ImportScope,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { rules, paths, scopes, warnings };
   }

   if (!Array.isArray(config?.instructions)) {
      return { rules, paths, scopes, warnings };
   }

   for (const instruction of config.instructions) {
      if (typeof instruction !== 'string') {
         warnings.push(`Skipping OpenCode instruction from ${configPath}: expected string path`);
         continue;
      }

      // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
      const imported = await importOpenCodeInstructionPattern(instruction, baseDir, scope);

      rules.push(...imported.rules);
      Object.assign(paths, imported.paths);
      Object.assign(scopes, imported.scopes);
      warnings.push(...imported.warnings);
   }

   return { rules, paths, scopes, warnings };
}

async function importOpenCodeInstructionPattern(
   instruction: string,
   baseDir: string,
   scope: ImportScope,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const pathsToRead = hasGlobSyntax(instruction)
            ? await expandInstructionGlob(instruction, baseDir)
            : [resolveInstructionPath(instruction, baseDir)],
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {},
         warnings: string[] = [];

   if (pathsToRead.length === 0) {
      warnings.push(`OpenCode instruction pattern matched no files: ${instruction}`);
   }

   for (const path of pathsToRead) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await readFile(path, 'utf-8'),
               name = basenameWithoutMarkdown(path);

         if (!content.trim()) {
            continue;
         }
         rules.push({ content: content.trim(), name, path, scope });
         paths[name] = path;
         scopes[name] = scope;
      } catch (err) {
         warnings.push(`Failed to read OpenCode instruction ${path}: ${(err as Error).message}`);
      }
   }

   return { rules, paths, scopes, warnings };
}

async function expandInstructionGlob(pattern: string, baseDir: string): Promise<string[]> {
   const root = isAbsolute(pattern) ? getGlobRoot(pattern) : baseDir,
         files = await listFilesRecursive(root),
         matcher = globToRegExp(isAbsolute(pattern) ? pattern : join(baseDir, pattern));

   return files.filter((file) => matcher.test(file)).toSorted();
}

async function listFilesRecursive(root: string): Promise<string[]> {
   const result: string[] = [];

   async function visit(dir: string): Promise<void> {
      let entries: RuntimeDirent[];

      try {
         entries = await readdir(dir, { withFileTypes: true }) as RuntimeDirent[];
      } catch {
         return;
      }

      for (const entry of entries) {
         const path = join(dir, entry.name);

         if (entry.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop -- Recursive walk is easier to reason about sequentially
            await visit(path);
         } else if (entry.isFile()) {
            result.push(path);
         }
      }
   }

   await visit(root);
   return result;
}

function hasGlobSyntax(value: string): boolean {
   return /[*?[\]{}]/.test(value);
}

function getGlobRoot(pattern: string): string {
   const parts = pattern.split('/'),
         rootParts: string[] = [];

   for (const part of parts) {
      if (hasGlobSyntax(part)) {
         break;
      }
      rootParts.push(part);
   }

   return rootParts.join('/') || '/';
}

function globToRegExp(pattern: string): RegExp {
   const segments = pattern.split('/');
   let normalized = '^',
       startIndex = 0;

   if (segments[0] === '') {
      normalized += '/';
      startIndex = 1;
   }

   for (let i = startIndex; i < segments.length; i++) {
      const segment = segments[i] ?? '',
            isLast = i === segments.length - 1;

      if (segment === '**') {
         normalized += '(?:[^/]+/)*';
         continue;
      }

      normalized += escapeGlobSegment(segment);

      if (!isLast) {
         normalized += '/';
      }
   }

   return new RegExp(`${normalized}$`);
}

function escapeGlobSegment(segment: string): string {
   return segment
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
}

function resolveInstructionPath(instruction: string, baseDir: string): string {
   return isAbsolute(instruction) ? instruction : join(baseDir, instruction);
}

function basenameWithoutMarkdown(path: string): string {
   const name = path.split('/').pop() ?? 'instruction';

   return name.replace(/\.(md|markdown|txt)$/i, '');
}

async function importOpenCodeConfigPrompts(
   configPath: string,
   scope: ImportScope,
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const prompts: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {},
         warnings: string[] = [];

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { prompts, paths, scopes, warnings };
   }

   if (!config?.command) {
      return { prompts, paths, scopes, warnings };
   }

   for (const [name, command] of Object.entries(config.command)) {
      if (typeof command.template !== 'string') {
         warnings.push(`Skipping OpenCode command "${name}" from ${configPath}: missing template`);
         continue;
      }

      prompts[name] = formatOpenCodeConfigPrompt(command);
      paths[name] = configPath;
      scopes[name] = scope;
   }

   return { prompts, paths, scopes, warnings };
}

function formatOpenCodeConfigPrompt(command: OpenCodeConfigCommand): string {
   if (typeof command.description !== 'string' || !command.description) {
      return String(command.template);
   }

   return `---\ndescription: ${JSON.stringify(command.description)}\n---\n\n${String(command.template)}`;
}

function mergePromptImports(
   base: {
      prompts: Record<string, string>;
      paths: Record<string, string>;
      scopes: Record<string, ImportScope>;
      warnings: string[];
   },
   overlay: {
      prompts: Record<string, string>;
      paths: Record<string, string>;
      scopes: Record<string, ImportScope>;
      warnings: string[];
   },
): {
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
} {
   return {
      prompts: { ...base.prompts, ...overlay.prompts },
      paths: { ...base.paths, ...overlay.paths },
      scopes: { ...base.scopes, ...overlay.scopes },
      warnings: [...base.warnings, ...overlay.warnings],
   };
}

async function importLocalSkills(
   editor: EditorName,
   projectRoot: string,
): Promise<{
   skills: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         skills: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   for (const skillDir of EDITOR_SKILL_DIRS[editor]) {
      const fullPath = join(projectRoot, skillDir);

      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const entries = await readdir(fullPath, { withFileTypes: true });

         for (const entry of entries) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) {
               continue;
            }

            const path = join(fullPath, entry.name);

            if (!existsSync(join(path, 'SKILL.md'))) {
               continue;
            }
            skills[entry.name] = path;
            paths[entry.name] = path;
            scopes[entry.name] = 'project';
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read skills from ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { skills, paths, scopes, warnings };
}

async function importGlobalSkills(editor: EditorName): Promise<{
   skills: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         skills: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   for (const skillDir of EDITOR_GLOBAL_SKILL_DIRS[editor] ?? []) {
      const fullPath = join(homedir(), skillDir);

      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const entries = await readdir(fullPath, { withFileTypes: true });

         for (const entry of entries) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) {
               continue;
            }

            const path = join(fullPath, entry.name);

            if (!existsSync(join(path, 'SKILL.md'))) {
               continue;
            }
            skills[entry.name] = path;
            paths[entry.name] = path;
            scopes[entry.name] = 'user';
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global skills from ${fullPath}: ${(err as Error).message}`,
            );
         }
      }
   }

   return { skills, paths, scopes, warnings };
}

function pathMapForNames(names: string[], path: string): Record<string, string> {
   return Object.fromEntries(names.map((name) => [name, path]));
}

function scopeMapForNames(names: string[], scope: ImportScope): Record<string, ImportScope> {
   return Object.fromEntries(names.map((name) => [name, scope]));
}

function promptPathMap(names: string[], files: string[], basePath: string): Record<string, string> {
   const fileByName = new Map(files.map((file) => [file.replace(/\.md$/, ''), file]));

   return Object.fromEntries(
      names.flatMap((name) => {
         const file = fileByName.get(name);

         return file ? [[name, join(basePath, file)]] : [];
      }),
   );
}

/**
 * Get the global config path for an editor.
 */
export function getGlobalConfigPath(editor: EditorName): string | null {
   const strategies = getImportStrategies(editor),
         configPath = strategies.mcp.getGlobalMcpConfigPath();

   if (!configPath) {
      return null;
   }
   return join(homedir(), configPath);
}
