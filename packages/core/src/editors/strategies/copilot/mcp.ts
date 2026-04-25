import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { getTransport } from '../../../mcp/normalize.js';

/**
 * GitHub Copilot MCP strategy. Copilot CLI uses `.mcp.json` at the project root and
 * `~/.copilot/mcp-config.json` for user-scoped config.
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
      return '.copilot/mcp-config.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         const transport = getTransport(serverConfig);

         if (transport.type === 'stdio') {
            const server: Record<string, unknown> = {
               type: 'local',
               command: transport.command,
            };

            if (transport.args && transport.args.length > 0) {
               server.args = transport.args;
            }
            if (transport.env && Object.keys(transport.env).length > 0) {
               server.env = transport.env;
            }

            mcpServers[name] = server;
         } else if (transport.type === 'http') {
            const server: Record<string, unknown> = {
               type: 'http',
               url: transport.url,
            };

            if (transport.headers && Object.keys(transport.headers).length > 0) {
               server.headers = transport.headers;
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
         const config = parseJsonObject(content),
               servers = getServerEntries(config);

         for (const [name, server] of Object.entries(servers)) {
            if (!isRecord(server)) {
               continue;
            }

            const parsed = parseServer(server);

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

function parseServer(server: Record<string, unknown>): McpServerConfig | null {
   if (typeof server.command === 'string') {
      const parsed: McpServerConfig = {
         command: server.command,
      };

      if (Array.isArray(server.args) && server.args.length > 0) {
         parsed.args = server.args.map(String);
      }
      if (isRecord(server.env) && Object.keys(server.env).length > 0) {
         parsed.env = stringifyRecord(server.env);
      }

      return parsed;
   }

   if (typeof server.url === 'string') {
      const parsed: McpServerConfig = {
         url: server.url,
      };

      if (isRecord(server.headers) && Object.keys(server.headers).length > 0) {
         parsed.headers = stringifyRecord(server.headers);
      }

      return parsed;
   }

   return null;
}

function stringifyRecord(value: Record<string, unknown>): Record<string, string> {
   return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}
