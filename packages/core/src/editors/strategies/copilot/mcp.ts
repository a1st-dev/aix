import type { McpServerConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import type { McpStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';
import { getGlobalCopilotDir } from './paths.js';

const ENTRY_OPTIONS = { transportTypes: { stdio: 'local', http: 'http' } } as const;

/**
 * GitHub Copilot MCP strategy. Copilot CLI uses `.mcp.json` at the project root and
 * `.config/github-copilot/mcp-config.json` for user-scoped config.
 */
export class CopilotMcpStrategy implements McpStrategy {
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
      return `${getGlobalCopilotDir()}/mcp-config.json`;
   }

   getProjectImportPaths(projectRoot: string): readonly string[] {
      return [
         join(projectRoot, this.getConfigPath()),
         join(projectRoot, '.github', 'mcp.json'),
      ];
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

function parseJsonObject(content: string): Record<string, unknown> {
   const parsed = JSON.parse(content);

   if (!isRecord(parsed)) {
      throw new Error('Config root must be an object');
   }

   return parsed;
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

