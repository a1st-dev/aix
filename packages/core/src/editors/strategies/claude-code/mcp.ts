import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { buildStandardServerEntry, StandardMcpStrategy } from '../shared/standard-mcp.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

const ENTRY_OPTIONS = { transportTypes: { stdio: 'stdio', http: 'http' } } as const;

/**
 * Claude Code MCP strategy. Uses `.mcp.json` (dot-prefixed) at the project root and
 * `~/.claude.json` for user scope, with a `mcpServers` object. Each server entry includes a `type`
 * field (`"stdio"` or `"http"`) as required by the Claude Code CLI.
 */
export class ClaudeCodeMcpStrategy extends StandardMcpStrategy implements McpStrategy {
   override getConfigPath(): string {
      return '.mcp.json';
   }

   override isProjectRootConfig(): boolean {
      return true;
   }

   override getGlobalMcpConfigPath(): string | null {
      const paths: Partial<Record<NodeJS.Platform, string>> = {
         darwin: '.claude.json',
         linux: '.claude.json',
         win32: '.claude.json',
      };

      return paths[getRuntimeAdapter().os.platform()] ?? null;
   }

   override formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         mcpServers[name] = buildStandardServerEntry(serverConfig, ENTRY_OPTIONS);
      }

      return JSON.stringify({ mcpServers }, null, 2) + '\n';
   }
}
