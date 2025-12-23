import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { getTransport } from '../../../mcp/normalize.js';

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

         const transport = getTransport(serverConfig);

         if (transport.type === 'stdio') {
            contextServers[name] = {
               command: transport.command,
               args: transport.args ?? [],
               env: transport.env ?? {},
            };
         } else if (transport.type === 'http') {
            contextServers[name] = {
               url: transport.url,
            };
         }
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
            } else {
               warnings.push(`Skipping Zed context server "${name}": unknown format`);
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse Zed settings: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}
