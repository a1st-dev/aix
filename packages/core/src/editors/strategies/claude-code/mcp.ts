import { platform } from 'node:os';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { StandardMcpStrategy } from '../shared/standard-mcp.js';

/**
 * Claude Code MCP strategy. Uses `.mcp.json` (dot-prefixed) with a `mcpServers` object. Each server
 * entry includes a `type` field (`"stdio"` or `"http"`) as required by the Claude Code CLI.
 */
export class ClaudeCodeMcpStrategy extends StandardMcpStrategy implements McpStrategy {
   override getConfigPath(): string {
      return '.mcp.json';
   }

   override isProjectRootConfig(): boolean {
      return true;
   }

   override getGlobalMcpConfigPath(): string | null {
      const paths: Record<string, string> = {
         darwin: 'Library/Application Support/Claude/claude_desktop_config.json',
         linux: '.config/Claude/claude_desktop_config.json',
         win32: 'AppData/Roaming/Claude/claude_desktop_config.json',
      };

      return paths[platform()] ?? null;
   }

   override formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         if ('command' in serverConfig) {
            const server: Record<string, unknown> = {
               type: 'stdio',
               command: serverConfig.command,
            };

            if (serverConfig.args && serverConfig.args.length > 0) {
               server.args = serverConfig.args;
            }
            if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
               server.env = serverConfig.env;
            }
            mcpServers[name] = server;
         } else if ('url' in serverConfig) {
            const server: Record<string, unknown> = {
               type: 'http',
               url: serverConfig.url,
            };

            if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
               server.headers = serverConfig.headers;
            }
            mcpServers[name] = server;
         }
      }

      return JSON.stringify({ mcpServers }, null, 2) + '\n';
   }
}
