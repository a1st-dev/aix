import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';

/**
 * Antigravity MCP strategy. Uses `mcp_config.json` with a `mcpServers` object.
 * Supports both project-level (`.agents/mcp_config.json`) and
 * global-level (`~/.gemini/config/mcp_config.json`) configuration.
 */
export class AntigravityMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'mcp_config.json';
   }

   isProjectRootConfig(): boolean {
      return false;
   }

   getGlobalMcpConfigPath(): string | null {
      return '.gemini/config/mcp_config.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         mcpServers[name] = buildStandardServerEntry(serverConfig);
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
         const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> },
               servers = config.mcpServers ?? {};

         for (const [name, server] of Object.entries(servers)) {
            const serverConfig = parseStandardServerEntry(server);

            if (!serverConfig) {
               warnings.push(`Skipping MCP server "${name}": unknown format`);
               continue;
            }

            mcp[name] = serverConfig;
         }
      } catch (err) {
         warnings.push(`Failed to parse Antigravity mcp_config.json: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}
