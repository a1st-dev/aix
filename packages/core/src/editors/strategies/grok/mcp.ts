import type { McpServerConfig } from '@a1st/aix-schema';
import { parseTOML, stringifyTOML } from 'confbox';
import type { McpStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';

/**
 * Grok CLI MCP strategy. Writes and reads TOML configuration from `.grok/config.toml`
 * (project) and `~/.grok/config.toml` (user/global) under `[mcp_servers.<name>]`.
 */
export class GrokMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   isGlobalOnly(): boolean {
      return false;
   }

   getConfigPath(): string {
      return 'config.toml';
   }

   getGlobalMcpConfigPath(): string | null {
      return '.grok/config.toml';
   }

   formatServerEntry(serverConfig: McpServerConfig): Record<string, unknown> {
      const server = buildStandardServerEntry(serverConfig);

      if (serverConfig.enabled === false) {
         server.enabled = false;
      }

      return server;
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, config] of Object.entries(mcp)) {
         mcpServers[name] = this.formatServerEntry(config);
      }

      return stringifyTOML({ mcp_servers: mcpServers });
   }

   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      const mcp: Record<string, McpServerConfig> = {},
            warnings: string[] = [];

      try {
         const parsed = parseTOML(content) as Record<string, unknown>;

         if (!isRecord(parsed.mcp_servers)) {
            return { mcp, warnings };
         }

         for (const [name, server] of Object.entries(parsed.mcp_servers)) {
            const entry = parseStandardServerEntry(server);

            if (!entry) {
               warnings.push(`MCP server "${name}" in Grok config has neither a command nor a URL, skipping.`);
               continue;
            }

            if (isRecord(server) && server.enabled === false) {
               entry.enabled = false;
            }

            mcp[name] = entry;
         }
      } catch (error) {
         warnings.push(`Failed to parse Grok TOML config: ${(error as Error).message}`);
      }

      return { mcp, warnings };
   }
}
