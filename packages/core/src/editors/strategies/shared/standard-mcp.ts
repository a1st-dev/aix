import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { parseStringRecord } from './mcp-import-utils.js';

/**
 * Standard MCP strategy used by Cursor. Uses `mcp.json` with a `mcpServers` object. Claude Code
 * extends this with {@link ClaudeCodeMcpStrategy} for its `.mcp.json` (dot-prefixed) filename.
 */
export class StandardMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'mcp.json';
   }

   isProjectRootConfig(): boolean {
      return false;
   }

   getGlobalMcpConfigPath(): string | null {
      return '.cursor/mcp.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

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
            const server: Record<string, unknown> = { url: serverConfig.url };

            if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
               server.headers = serverConfig.headers;
            }
            mcpServers[name] = server;
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

            if (s.command) {
               const serverConfig: Record<string, unknown> = {
                        command: String(s.command),
                     },
                     env = parseStringRecord(s.env);

               if (Array.isArray(s.args) && s.args.length > 0) {
                  serverConfig.args = s.args.map(String);
               }
               if (env) {
                  serverConfig.env = env;
               }

               mcp[name] = serverConfig as McpServerConfig;
            } else if (s.url) {
               const serverConfig: Record<string, unknown> = {
                        url: String(s.url),
                     },
                     headers = parseStringRecord(s.headers);

               if (headers) {
                  serverConfig.headers = headers;
               }

               mcp[name] = serverConfig as McpServerConfig;
            } else {
               warnings.push(`Skipping MCP server "${name}": unknown format`);
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}
