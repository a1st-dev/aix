import type { McpServerConfig } from '@a1st/aix-schema';
import { parseTOML, stringifyTOML } from 'confbox';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';

/**
 * Format MCP config for Codex's config.toml format.
 * Codex uses TOML with [mcp_servers.name] sections.
 */
function formatCodexMcp(mcp: Record<string, McpServerConfig>): string {
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

      mcpServers[name] = server;
   }

   return stringifyTOML({ mcp_servers: mcpServers });
}

/**
 * Parse Codex's config.toml format for MCP servers.
 * Outputs shorthand config without defaults.
 */
function parseCodexMcp(content: string): {
   mcp: Record<string, McpServerConfig>;
   warnings: string[];
} {
   const mcp: Record<string, McpServerConfig> = {},
         warnings: string[] = [];

   try {
      const config = parseTOML(content) as { mcp_servers?: Record<string, unknown> },
            servers = config.mcp_servers ?? {};

      for (const [name, server] of Object.entries(servers)) {
         const s = server as Record<string, unknown>;

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
            mcp[name] = { url: String(s.url) } as McpServerConfig;
         } else {
            warnings.push(`Skipping MCP server "${name}": unknown format`);
         }
      }
   } catch (err) {
      warnings.push(`Failed to parse TOML config: ${(err as Error).message}`);
   }

   return { mcp, warnings };
}

/**
 * Codex MCP strategy. Uses global-only config at ~/.codex/config.toml.
 */
export class CodexMcpStrategy extends GlobalMcpStrategy {
   constructor() {
      super({
         editor: 'codex',
         globalConfigPath: '.codex/config.toml',
         format: 'toml',
         formatFn: formatCodexMcp,
         parseFn: parseCodexMcp,
      });
   }
}
