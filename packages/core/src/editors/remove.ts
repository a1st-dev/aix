import { dirname, join } from 'pathe';
import { parseTOML, stringifyTOML } from 'confbox';
import { parseJsonc } from '@a1st/aix-schema';
import type { ConfigScope } from '@a1st/aix-schema';
import { getRuntimeAdapter } from '../runtime/index.js';
import { getAdapter } from './install.js';
import type { EditorName } from './types.js';
import type { McpStrategy } from './strategies/types.js';

export interface RemoveMcpFromEditorResult {
   editor: EditorName;
   success: boolean;
   removed: boolean;
   path?: string;
   errors: string[];
}

interface RemoveMcpFromEditorOptions {
   targetScope?: ConfigScope;
}

const MCP_KEYS = ['mcpServers', 'context_servers', 'mcp', 'mcp_servers'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
   editor: EditorName,
   serverName: string,
   projectRoot: string,
   options: RemoveMcpFromEditorOptions = {},
): Promise<RemoveMcpFromEditorResult> {
   const adapter = getAdapter(editor),
         { mcpStrategy, configDir } = adapter.getStrategyBundle(),
         targetScope = options.targetScope ?? 'project',
         result: RemoveMcpFromEditorResult = {
            editor,
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
   editors: readonly EditorName[],
   serverName: string,
   projectRoot: string,
   options: RemoveMcpFromEditorOptions = {},
): Promise<RemoveMcpFromEditorResult[]> {
   const results: RemoveMcpFromEditorResult[] = [];

   for (const editor of editors) {
      // eslint-disable-next-line no-await-in-loop -- Sequential for predictable config writes
      results.push(await removeMcpFromEditor(editor, serverName, projectRoot, options));
   }

   return results;
}
