import type { McpServerConfig } from '@a1st/aix-schema';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';
import { parseStringRecord } from '../shared/mcp-import-utils.js';

/**
 * Build a single Windsurf `mcpServers` entry. Windsurf documents `serverUrl` for remote
 * servers, along with a `headers` map for authentication.
 * Source: https://docs.devin.ai/desktop/cascade/mcp
 */
function buildWindsurfServerEntry(serverConfig: McpServerConfig): Record<string, unknown> {
   const server: Record<string, unknown> = {};

   if ('command' in serverConfig) {
      server.command = serverConfig.command;
      if (serverConfig.args && serverConfig.args.length > 0) {
         server.args = serverConfig.args;
      }
      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
         server.env = serverConfig.env;
      }
   } else if ('url' in serverConfig) {
      server.serverUrl = serverConfig.url;
      if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
         server.headers = serverConfig.headers;
      }
   }

   if ('disabledTools' in serverConfig && Array.isArray(serverConfig.disabledTools) &&
       serverConfig.disabledTools.length > 0) {
      server.disabledTools = serverConfig.disabledTools;
   }

   return server;
}

/**
 * Format MCP config for Windsurf's mcp_config.json format.
 * Outputs shorthand format without default values.
 */
function formatWindsurfMcp(mcp: Record<string, McpServerConfig>): string {
   const mcpServers: Record<string, unknown> = {};

   for (const [name, serverConfig] of Object.entries(mcp)) {
      if (serverConfig.enabled === false) {
         continue;
      }

      mcpServers[name] = buildWindsurfServerEntry(serverConfig);
   }

   return JSON.stringify({ mcpServers }, null, 2) + '\n';
}

/**
 * Parse Windsurf's mcp_config.json format.
 * Outputs shorthand format without default values.
 */
function parseWindsurfMcp(content: string): {
   mcp: Record<string, McpServerConfig>;
   warnings: string[];
} {
   const mcp: Record<string, McpServerConfig> = {},
         warnings: string[] = [];

   try {
      const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> },
            servers = config.mcpServers ?? {};

      for (const [name, server] of Object.entries(servers)) {
         const s = server as Record<string, unknown>,
               disabledTools = Array.isArray(s.disabledTools)
                  ? s.disabledTools.map(String)
                  : undefined,
               remoteUrl = s.serverUrl ?? s.url;

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
            if (s.disabled === true) {
               serverConfig.enabled = false;
            }
            if (disabledTools && disabledTools.length > 0) {
               serverConfig.disabledTools = disabledTools;
            }

            mcp[name] = serverConfig as McpServerConfig;
         } else if (remoteUrl) {
            const serverConfig: Record<string, unknown> = {
                     url: String(remoteUrl),
                  },
                  headers = parseStringRecord(s.headers);

            if (headers) {
               serverConfig.headers = headers;
            }
            if (s.disabled === true) {
               serverConfig.enabled = false;
            }
            if (disabledTools && disabledTools.length > 0) {
               serverConfig.disabledTools = disabledTools;
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

/**
 * Windsurf MCP strategy. Uses global-only config at ~/.codeium/windsurf/mcp_config.json.
 */
export class WindsurfMcpStrategy extends GlobalMcpStrategy {
   constructor() {
      super({
         editor: 'windsurf',
         globalConfigPath: '.codeium/windsurf/mcp_config.json',
         format: 'json',
         formatFn: formatWindsurfMcp,
         formatEntryFn: buildWindsurfServerEntry,
         parseFn: parseWindsurfMcp,
      });
   }
}
