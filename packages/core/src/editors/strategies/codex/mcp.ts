import type { McpServerConfig } from '@a1st/aix-schema';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';

/**
 * Format MCP config for Codex's config.toml format.
 * Codex uses TOML with [mcp_servers.name] sections.
 */
function formatCodexMcp(mcp: Record<string, McpServerConfig>): string {
   const lines: string[] = [];

   for (const [name, serverConfig] of Object.entries(mcp)) {
      if (serverConfig.enabled === false) {
         continue;
      }

      lines.push(`[mcp_servers.${name}]`);

      if ('command' in serverConfig) {
         lines.push(`command = "${serverConfig.command}"`);
         if (serverConfig.args && serverConfig.args.length > 0) {
            const argsStr = serverConfig.args.map((a) => `"${a}"`).join(', ');

            lines.push(`args = [${argsStr}]`);
         }
         if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
            lines.push('[mcp_servers.' + name + '.env]');
            for (const [key, value] of Object.entries(serverConfig.env)) {
               lines.push(`${key} = "${value}"`);
            }
         }
      } else if ('url' in serverConfig) {
         lines.push(`url = "${serverConfig.url}"`);
      }

      lines.push('');
   }

   return lines.join('\n');
}

/**
 * Parse Codex's config.toml format for MCP servers.
 * Uses confbox for TOML parsing. Outputs shorthand config without defaults.
 */
async function parseCodexMcp(content: string): Promise<{
   mcp: Record<string, McpServerConfig>;
   warnings: string[];
}> {
   const mcp: Record<string, McpServerConfig> = {},
         warnings: string[] = [];

   try {
      const { parseTOML } = await import('confbox'),
            config = parseTOML(content) as { mcp_servers?: Record<string, unknown> },
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
 * Synchronous wrapper for parseCodexMcp that returns empty on parse failure.
 * Used for the McpStrategy interface which expects sync parsing.
 */
function parseCodexMcpSync(_content: string): {
   mcp: Record<string, McpServerConfig>;
   warnings: string[];
} {
   return {
      mcp: {},
      warnings: ['Codex TOML parsing requires async - use parseCodexMcp instead'],
   };
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
         parseFn: parseCodexMcpSync,
      });
   }
}

export { parseCodexMcp };
