import { parseJsonc, type McpServerConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import type { McpStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';
import { getGlobalCopilotDir } from './paths.js';

const ENTRY_OPTIONS = { transportTypes: { stdio: 'local', http: 'http' } } as const;

/**
 * GitHub Copilot MCP strategy. Copilot CLI uses `.mcp.json` at the project root and
 * `.copilot/mcp-config.json` for user-scoped config.
 */
export class CopilotMcpStrategy implements McpStrategy {

   constructor(private readonly globalDir: string = getGlobalCopilotDir()) {}

   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '.mcp.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   getGlobalMcpConfigPath(): string | null {
      return `${this.globalDir}/mcp-config.json`;
   }

   getProjectImportPaths(projectRoot: string): readonly string[] {
      return [
         join(projectRoot, this.getConfigPath()),
         join(projectRoot, '.github', 'mcp.json'),
      ];
   }

   getJsonServerPaths(config: Record<string, unknown>, name: string): string[][] {
      const servers = getServerEntries(config);

      if (!Object.hasOwn(servers, name) || !isFlatServerEntry(servers[name])) {
         return [];
      }
      if (servers === config.mcpServers) {
         return [[ 'mcpServers', name ]];
      }
      if (servers === config.servers) {
         return [[ 'servers', name ]];
      }
      return [[ name ]];
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         mcpServers[name] = buildStandardServerEntry(serverConfig, ENTRY_OPTIONS);
      }

      return JSON.stringify({ mcpServers }, null, 2) + '\n';
   }

   /**
    * Copilot also reads a legacy layout with the servers as top-level keys. Move those under
    * `mcpServers` so a merge does not leave the same server in both places.
    */
   normalizeExistingConfig(config: Record<string, unknown>): Record<string, unknown> {
      if (config.mcpServers || config.servers) {
         return config;
      }

      const entries = Object.entries(config),
            mcpServers = Object.fromEntries(entries.filter(([, value]) => {
               return isFlatServerEntry(value);
            }));

      if (Object.keys(mcpServers).length === 0) {
         return config;
      }

      return {
         ...Object.fromEntries(entries.filter(([, value]) => {
            return !isFlatServerEntry(value);
         })),
         mcpServers,
      };
   }

   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      const mcp: Record<string, McpServerConfig> = {},
            warnings: string[] = [];

      try {
         const config = parseJsonObject(content),
               servers = getServerEntries(config);

         for (const [name, server] of Object.entries(servers)) {
            const parsed = parseStandardServerEntry(server);

            if (!parsed) {
               warnings.push(`Skipping GitHub Copilot MCP server "${name}": unknown format`);
               continue;
            }

            mcp[name] = parsed;
         }
      } catch (err) {
         warnings.push(`Failed to parse GitHub Copilot MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}

function isFlatServerEntry(value: unknown): value is Record<string, unknown> {
   return isRecord(value) && (typeof value.command === 'string' || typeof value.url === 'string');
}

function parseJsonObject(content: string): Record<string, unknown> {
   const parsed = parseJsonc<Record<string, unknown>>(content);

   if (parsed.errors.length > 0 || !isRecord(parsed.data)) {
      const detail = parsed.errors[0]?.message ?? 'Config root must be an object';

      throw new Error(detail);
   }

   return parsed.data;
}

function getServerEntries(config: Record<string, unknown>): Record<string, unknown> {
   if (isRecord(config.mcpServers)) {
      return config.mcpServers;
   }
   if (isRecord(config.servers)) {
      return config.servers;
   }
   return config;
}

