import type { McpServerConfig } from '@a1st/aix-schema';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';

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
         server.url = serverConfig.url;
      }

      if ('disabledTools' in serverConfig && Array.isArray(serverConfig.disabledTools) &&
          serverConfig.disabledTools.length > 0) {
         server.disabledTools = serverConfig.disabledTools;
      }

      mcpServers[name] = server;
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
                  : undefined;

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
            if (s.disabled === true) {
               serverConfig.enabled = false;
            }
            if (disabledTools && disabledTools.length > 0) {
               serverConfig.disabledTools = disabledTools;
            }

            mcp[name] = serverConfig as McpServerConfig;
         } else if (s.url) {
            const serverConfig: Record<string, unknown> = {
               url: String(s.url),
            };

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
         parseFn: parseWindsurfMcp,
      });
   }
}
