import { platform } from 'node:os';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { getTransport } from '../../../mcp/normalize.js';

/**
 * VS Code MCP strategy. VS Code uses `mcp.json` with a `servers` object (not `mcpServers`).
 * Project-level config goes to `.vscode/mcp.json`.
 */
export class VSCodeMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'mcp.json';
   }

   getGlobalMcpConfigPath(): string | null {
      const paths: Record<string, string> = {
         darwin: 'Library/Application Support/Code/User/mcp.json',
         linux: '.config/Code/User/mcp.json',
         win32: 'AppData/Roaming/Code/User/mcp.json',
      };

      return paths[platform()] ?? null;
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const servers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         const transport = getTransport(serverConfig);

         if (transport.type === 'stdio') {
            servers[name] = {
               command: transport.command,
               args: transport.args ?? [],
               env: transport.env ?? {},
            };
         } else if (transport.type === 'http') {
            servers[name] = {
               type: 'http',
               url: transport.url,
            };
         }
      }

      return JSON.stringify({ servers }, null, 2) + '\n';
   }

   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      const mcp: Record<string, McpServerConfig> = {},
            warnings: string[] = [];

      try {
         const config = JSON.parse(content) as { servers?: Record<string, unknown> },
               servers = config.servers ?? {};

         for (const [name, server] of Object.entries(servers)) {
            const s = server as Record<string, unknown>;

            if (s.command) {
               mcp[name] = {
                  command: String(s.command),
                  args: Array.isArray(s.args) ? s.args.map(String) : [],
                  env:
                     typeof s.env === 'object' && s.env !== null
                        ? Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, String(v)]))
                        : undefined,
                  enabled: true,
                  autoStart: true,
                  restartOnFailure: true,
                  maxRestarts: 3,
               };
            } else if (s.type === 'http' && s.url) {
               mcp[name] = {
                  url: String(s.url),
                  validateOrigin: false,
                  enabled: true,
                  autoStart: true,
                  restartOnFailure: true,
                  maxRestarts: 3,
               };
            } else {
               warnings.push(`Skipping VS Code MCP server "${name}": unknown format`);
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse VS Code MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}
