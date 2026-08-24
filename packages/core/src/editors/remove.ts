import { dirname, join } from 'pathe';
import { isRecord } from '../type-guards.js';
import { parseTOML, stringifyTOML } from 'confbox';
import { parseJsonc } from '@a1st/aix-schema';
import type { ConfigScope, HookEvent } from '@a1st/aix-schema';
import { getRuntimeAdapter } from '../runtime/index.js';
import { getAdapter } from './install.js';
import type { EditorName } from './types.js';
import { normalizeEditorName, normalizeEditorNames } from './types.js';
import type { HooksStrategy, McpStrategy } from './strategies/types.js';
import { resolveHooksConfigPath } from './strategies/shared/index.js';

export interface RemoveMcpFromEditorResult {
   editor: EditorName;
   success: boolean;
   removed: boolean;
   path?: string;
   errors: string[];
}

export interface RemoveHookFromEditorResult {
   editor: EditorName;
   success: boolean;
   removed: boolean;
   /** How many native hook entries were removed */
   removedCount: number;
   /** True when the editor supports hooks but has no config file at the requested scope */
   unsupportedScope?: boolean;
   /** True when the editor has no hooks support at all */
   unsupported?: boolean;
   path?: string;
   errors: string[];
}

interface RemoveMcpFromEditorOptions {
   targetScope?: ConfigScope;
}

interface RemoveHookFromEditorOptions {
   targetScope?: ConfigScope;
}

const MCP_KEYS = ['mcpServers', 'context_servers', 'mcp', 'mcp_servers'] as const;


function getMcpConfigPath(
   strategy: McpStrategy,
   projectRoot: string,
   configDir: string,
   targetScope: ConfigScope,
): string | undefined {
   const globalPath = strategy.getGlobalMcpConfigPath();

   if (strategy.isGlobalOnly?.()) {
      return globalPath ? join(getRuntimeAdapter().os.homedir(), globalPath) : undefined;
   }

   if (targetScope === 'user' && globalPath) {
      return join(getRuntimeAdapter().os.homedir(), globalPath);
   }

   return join(strategy.isProjectRootConfig?.() ? projectRoot : join(projectRoot, configDir), strategy.getConfigPath());
}

function removeFromJsonMcpConfig(content: string, serverName: string): string | undefined {
   const parsed = parseJsonc<Record<string, unknown>>(content);

   if (parsed.errors.length > 0 || !parsed.data) {
      return undefined;
   }

   const config = parsed.data;

   for (const key of MCP_KEYS) {
      const servers = config[key];

      if (!isRecord(servers) || !(serverName in servers)) {
         continue;
      }

      delete servers[serverName];
      config[key] = servers;

      return JSON.stringify(config, null, 2) + '\n';
   }

   return undefined;
}

function removeFromTomlMcpConfig(content: string, serverName: string): string | undefined {
   const config = parseTOML(content) as Record<string, unknown>,
         servers = config.mcp_servers;

   if (!isRecord(servers) || !(serverName in servers)) {
      return undefined;
   }

   delete servers[serverName];
   config.mcp_servers = servers;

   return stringifyTOML(config);
}

export async function removeMcpFromEditor(
   editor: string,
   serverName: string,
   projectRoot: string,
   options: RemoveMcpFromEditorOptions = {},
): Promise<RemoveMcpFromEditorResult> {
   const editorName = normalizeEditorName(editor),
         adapter = getAdapter(editorName),
         { mcpStrategy, configDir } = adapter.getStrategyBundle(),
         targetScope = options.targetScope ?? 'project',
         result: RemoveMcpFromEditorResult = {
            editor: editorName,
            success: true,
            removed: false,
            errors: [],
         };

   if (!mcpStrategy.isSupported()) {
      return result;
   }

   const configPath = getMcpConfigPath(mcpStrategy, projectRoot, configDir, targetScope);

   if (!configPath || !getRuntimeAdapter().fs.existsSync(configPath)) {
      return result;
   }

   result.path = configPath;

   try {
      const content = await getRuntimeAdapter().fs.readFile(configPath, 'utf-8'),
            nextContent = configPath.endsWith('.toml')
               ? removeFromTomlMcpConfig(content, serverName)
               : removeFromJsonMcpConfig(content, serverName);

      if (nextContent === undefined) {
         return result;
      }

      await getRuntimeAdapter().fs.mkdir(dirname(configPath), { recursive: true });
      await getRuntimeAdapter().fs.writeFile(configPath, nextContent, 'utf-8');

      return { ...result, removed: true };
   } catch (error) {
      return {
         ...result,
         success: false,
         errors: [error instanceof Error ? error.message : String(error)],
      };
   }
}

export async function removeMcpFromEditors(
   editors: readonly string[],
   serverName: string,
   projectRoot: string,
   options: RemoveMcpFromEditorOptions = {},
): Promise<RemoveMcpFromEditorResult[]> {
   const results: RemoveMcpFromEditorResult[] = [];

   for (const editor of normalizeEditorNames(editors)) {
      // eslint-disable-next-line no-await-in-loop -- Sequential for predictable config writes
      results.push(await removeMcpFromEditor(editor, serverName, projectRoot, options));
   }

   return results;
}

/**
 * Whether a single native hook entry is one aix would attribute to `event`. The strategy's
 * own importer decides, so shared native events stay separated: on Claude Code a
 * `PreToolUse` group matching `Bash` belongs to `pre_command`, while one matching
 * `Write|Edit` belongs to `pre_file_write`.
 */
function entryBelongsToEvent(
   strategy: HooksStrategy,
   nativeEvent: string,
   entry: unknown,
   event: HookEvent,
): boolean {
   const probe = strategy.parseImportedConfig(JSON.stringify({ hooks: { [nativeEvent]: [entry] } }));

   return Object.keys(probe.hooks).includes(event);
}

function removeHookFromConfigContent(
   strategy: HooksStrategy,
   content: string,
   event: HookEvent,
): { content: string; removedCount: number } | undefined {
   const parsed = parseJsonc<Record<string, unknown>>(content);

   if (parsed.errors.length > 0 || !parsed.data) {
      return undefined;
   }

   const config = parsed.data,
         hooks = config.hooks;

   if (!isRecord(hooks)) {
      return undefined;
   }

   let removedCount = 0;

   for (const [ nativeEvent, entries ] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) {
         continue;
      }

      const kept = entries.filter((entry) => {
         return !entryBelongsToEvent(strategy, nativeEvent, entry, event);
      });

      if (kept.length === entries.length) {
         continue;
      }

      removedCount += entries.length - kept.length;
      if (kept.length === 0) {
         delete hooks[nativeEvent];
      } else {
         hooks[nativeEvent] = kept;
      }
   }

   if (removedCount === 0) {
      return undefined;
   }

   if (Object.keys(hooks).length === 0) {
      delete config.hooks;
   }

   return { content: JSON.stringify(config, null, 2) + '\n', removedCount };
}

/**
 * Remove every hook entry an editor holds for one aix event, leaving hooks that came from
 * other events, and hand-written entries, in place.
 */
export async function removeHookFromEditor(
   editor: string,
   event: HookEvent,
   projectRoot: string,
   options: RemoveHookFromEditorOptions = {},
): Promise<RemoveHookFromEditorResult> {
   const editorName = normalizeEditorName(editor),
         adapter = getAdapter(editorName),
         { hooksStrategy, configDir } = adapter.getStrategyBundle(),
         targetScope = options.targetScope ?? 'project',
         result: RemoveHookFromEditorResult = {
            editor: editorName,
            success: true,
            removed: false,
            removedCount: 0,
            errors: [],
         };

   if (!hooksStrategy.isSupported()) {
      return { ...result, unsupported: true };
   }

   const configPath = resolveHooksConfigPath(
      hooksStrategy,
      join(projectRoot, configDir),
      targetScope,
   );

   if (!configPath) {
      return { ...result, unsupportedScope: true };
   }

   if (!getRuntimeAdapter().fs.existsSync(configPath)) {
      return result;
   }

   result.path = configPath;

   try {
      const content = await getRuntimeAdapter().fs.readFile(configPath, 'utf-8'),
            next = removeHookFromConfigContent(hooksStrategy, content, event);

      if (!next) {
         return result;
      }

      await getRuntimeAdapter().fs.writeFile(configPath, next.content, 'utf-8');

      return { ...result, removed: true, removedCount: next.removedCount };
   } catch (error) {
      return {
         ...result,
         success: false,
         errors: [error instanceof Error ? error.message : String(error)],
      };
   }
}

export async function removeHookFromEditors(
   editors: readonly string[],
   event: HookEvent,
   projectRoot: string,
   options: RemoveHookFromEditorOptions = {},
): Promise<RemoveHookFromEditorResult[]> {
   const results: RemoveHookFromEditorResult[] = [];

   for (const editor of normalizeEditorNames(editors)) {
      // eslint-disable-next-line no-await-in-loop -- Sequential for predictable config writes
      results.push(await removeHookFromEditor(editor, event, projectRoot, options));
   }

   return results;
}
