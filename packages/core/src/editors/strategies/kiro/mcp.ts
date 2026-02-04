import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';

/**
 * Kiro MCP strategy - uses standard MCP JSON format at `.kiro/settings/mcp.json`.
 * Format is identical to Cursor/Claude Code with `mcpServers` object.
 */
export class KiroMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   isGlobalOnly(): boolean {
      return false;
   }

   getConfigPath(): string {
      return 'settings/mcp.json';
   }

   getGlobalMcpConfigPath(): string | null {
      return '.kiro/settings/mcp.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         // Skip disabled servers
         if (serverConfig.enabled === false) {
            continue;
         }

         // Handle command-based servers
         if ('command' in serverConfig) {
            const server: Record<string, unknown> = { command: serverConfig.command };

            if (serverConfig.args && serverConfig.args.length > 0) {
               server.args = serverConfig.args;
            }
            if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
               server.env = serverConfig.env;
            }
            mcpServers[name] = server;
         } else if ('url' in serverConfig) {
            // Handle URL-based servers
            mcpServers[name] = { url: serverConfig.url };
         }
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
            const s = server as Record<string, unknown>;

            // Parse command-based server
            if (s.command) {
               const serverConfig: Record<string, unknown> = {
                  command: String(s.command),
               };

               if (Array.isArray(s.args) && s.args.length > 0) {
                  serverConfig.args = s.args.map(String);
               }
               if (typeof s.env === 'object' && s.env !== null && Object.keys(s.env).length > 0) {
                  serverConfig.env = Object.fromEntries(
                     Object.entries(s.env).map(([k, v]) => [k, String(v)]),
                  );
               }

               mcp[name] = serverConfig as McpServerConfig;
            } else if (s.url) {
               // Parse URL-based server
               mcp[name] = { url: String(s.url) } as McpServerConfig;
            } else {
               // Unknown format
               warnings.push(`Skipping MCP server "${name}": unknown format`);
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}
