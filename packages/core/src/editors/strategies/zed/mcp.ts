import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';

/**
 * Zed MCP strategy. Uses `settings.json` with a `context_servers` object. Note that Zed's MCP
 * config is typically in the user's global settings, not project-level.
 */
export class ZedMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getGlobalMcpConfigPath(): string | null {
      return '.config/zed/settings.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const contextServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         contextServers[name] = buildZedServerEntry(serverConfig);
      }

      return JSON.stringify({ context_servers: contextServers }, null, 2) + '\n';
   }

   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      const mcp: Record<string, McpServerConfig> = {},
            warnings: string[] = [];

      try {
         const config = JSON.parse(content) as { context_servers?: Record<string, unknown> },
               servers = config.context_servers ?? {};

         for (const [name, server] of Object.entries(servers)) {
            const serverConfig = parseStandardServerEntry(server);

            if (!serverConfig) {
               warnings.push(`Skipping Zed context server "${name}": unknown format`);
               continue;
            }

            mcp[name] = serverConfig;
         }
      } catch (err) {
         warnings.push(`Failed to parse Zed settings: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}

/**
 * Zed documents local context servers with `args` and `env` always present, so write both
 * keys even when they are empty. Remote servers use the shared `url`/`headers` shape.
 * Source: https://zed.dev/docs/ai/mcp
 */
function buildZedServerEntry(serverConfig: McpServerConfig): Record<string, unknown> {
   const server = buildStandardServerEntry(serverConfig);

   if ('command' in server) {
      server.args = server.args ?? [];
      server.env = server.env ?? {};
   }

   return server;
}
