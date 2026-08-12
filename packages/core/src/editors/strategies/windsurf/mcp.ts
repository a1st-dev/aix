import type { McpServerConfig } from '@a1st/aix-schema';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';
import { isRecord } from '../../../type-guards.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';

/**
 * Windsurf documents `serverUrl` for remote servers, but reads `url` too.
 * Source: https://docs.devin.ai/desktop/cascade/mcp
 */
const ENTRY_OPTIONS = { urlKeys: [ 'serverUrl', 'url' ] } as const;

/**
 * Build a single Windsurf `mcpServers` entry. Windsurf can hold a server in a disabled state,
 * so a server turned off with us is written as `disabled` rather than left out of the file.
 */
function buildWindsurfServerEntry(serverConfig: McpServerConfig): Record<string, unknown> {
   const server = buildStandardServerEntry(serverConfig, ENTRY_OPTIONS);

   if (serverConfig.enabled === false) {
      server.disabled = true;
   }
   if (Array.isArray(serverConfig.disabledTools) && serverConfig.disabledTools.length > 0) {
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
         const serverConfig = parseWindsurfServerEntry(server);

         if (!serverConfig) {
            warnings.push(`Skipping MCP server "${name}": unknown format`);
            continue;
         }

         mcp[name] = serverConfig;
      }
   } catch (err) {
      warnings.push(`Failed to parse MCP config: ${(err as Error).message}`);
   }

   return { mcp, warnings };
}

function parseWindsurfServerEntry(server: unknown): McpServerConfig | null {
   const parsed = parseStandardServerEntry(server, ENTRY_OPTIONS);

   if (!parsed || !isRecord(server)) {
      return parsed;
   }

   if (server.disabled === true) {
      parsed.enabled = false;
   }
   if (Array.isArray(server.disabledTools) && server.disabledTools.length > 0) {
      parsed.disabledTools = server.disabledTools.map(String);
   }

   return parsed;
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
