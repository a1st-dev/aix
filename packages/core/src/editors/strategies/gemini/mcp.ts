import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';

/**
 * Gemini CLI splits remote servers across two keys: `httpUrl` is a streamable HTTP endpoint
 * and `url` is an SSE one. Our `url` means streamable HTTP, so `httpUrl` is what we write, and
 * an entry using either key can be read back.
 * Source: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
 */
const ENTRY_OPTIONS = { urlKeys: [ 'httpUrl', 'url' ] } as const;

/**
 * Gemini CLI MCP strategy. Uses `settings.json` with a `mcpServers` object, similar to
 * Cursor and Claude Code. Supports both project-level (`.gemini/settings.json`) and
 * global-level (`~/.gemini/settings.json`) configuration.
 */
export class GeminiMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   isProjectRootConfig(): boolean {
      return false;
   }

   getGlobalMcpConfigPath(): string | null {
      return '.gemini/settings.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         mcpServers[name] = buildStandardServerEntry(serverConfig, ENTRY_OPTIONS);
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
            const serverConfig = parseStandardServerEntry(server, ENTRY_OPTIONS);

            if (!serverConfig) {
               warnings.push(`Skipping MCP server "${name}": unknown format`);
               continue;
            }

            if (isSseOnlyServer(server)) {
               warnings.push(
                  `MCP server "${name}" uses Gemini's SSE endpoint, which is imported as a streamable HTTP URL`,
               );
            }

            mcp[name] = serverConfig;
         }
      } catch (err) {
         warnings.push(`Failed to parse Gemini settings.json: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}

/**
 * We have no separate transport for SSE, so a server Gemini reaches over SSE comes across as a
 * streamable HTTP one. Worth saying out loud rather than dropping the server.
 */
function isSseOnlyServer(server: unknown): boolean {
   return isRecord(server) && typeof server.url === 'string' && typeof server.httpUrl !== 'string';
}
