import { parseJsonc, type McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';

/**
 * OpenCode stores MCP servers in the top-level `mcp` object in `opencode.json`.
 */
export class OpenCodeMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'opencode.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   getGlobalMcpConfigPath(): string | null {
      return '.config/opencode/opencode.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const openCodeMcp: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         openCodeMcp[name] = formatServerConfig(serverConfig);
      }

      return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: openCodeMcp }, null, 2) + '\n';
   }

   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      const mcp: Record<string, McpServerConfig> = {},
            warnings: string[] = [];

      try {
         const parsed = parseJsonc<{ mcp?: Record<string, unknown> }>(content);

         if (parsed.errors.length > 0 || !parsed.data) {
            warnings.push('Failed to parse MCP config: invalid JSONC');
            return { mcp, warnings };
         }

         const config = parsed.data,
               servers = config.mcp ?? {};

         for (const [name, server] of Object.entries(servers)) {
            const serverConfig = parseServerConfig(name, server, warnings);

            if (serverConfig) {
               mcp[name] = serverConfig;
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}

function formatServerConfig(serverConfig: McpServerConfig): Record<string, unknown> {
   if ('command' in serverConfig) {
      const server: Record<string, unknown> = {
         type: 'local',
         command: [serverConfig.command, ...(serverConfig.args ?? [])],
      };

      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
         server.environment = serverConfig.env;
      }
      addCommonServerOptions(server, serverConfig);

      return server;
   }

   const server: Record<string, unknown> = {
      type: 'remote',
      url: serverConfig.url,
   };

   if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
      server.headers = serverConfig.headers;
   }
   addCommonServerOptions(server, serverConfig);

   return server;
}

function addCommonServerOptions(
   target: Record<string, unknown>,
   source: McpServerConfig,
): void {
   if (source.enabled !== undefined) {
      target.enabled = source.enabled;
   }
   if ('timeout' in source && source.timeout !== undefined) {
      target.timeout = source.timeout;
   }
}

function parseServerConfig(
   name: string,
   server: unknown,
   warnings: string[],
): McpServerConfig | null {
   if (!server || typeof server !== 'object') {
      warnings.push(`Skipping MCP server "${name}": expected object config`);
      return null;
   }

   const raw = server as Record<string, unknown>;

   if (raw.type === 'local') {
      return parseLocalServerConfig(name, raw, warnings);
   }
   if (raw.type === 'remote') {
      return parseRemoteServerConfig(name, raw, warnings);
   }
   if (typeof raw.enabled === 'boolean' && Object.keys(raw).length === 1) {
      warnings.push(`Skipping MCP server "${name}": enable-only overrides need a base remote config`);
      return null;
   }

   warnings.push(`Skipping MCP server "${name}": unknown OpenCode MCP type`);
   return null;
}

function parseLocalServerConfig(
   name: string,
   raw: Record<string, unknown>,
   warnings: string[],
): McpServerConfig | null {
   if (!Array.isArray(raw.command) || raw.command.length === 0) {
      warnings.push(`Skipping MCP server "${name}": local server command must be a non-empty array`);
      return null;
   }

   const commandParts = raw.command.map(String),
         serverConfig: Record<string, unknown> = { command: commandParts[0] };

   if (commandParts.length > 1) {
      serverConfig.args = commandParts.slice(1);
   }
   if (isStringRecord(raw.environment)) {
      serverConfig.env = raw.environment;
   }
   addParsedCommonOptions(serverConfig, raw);

   return serverConfig as McpServerConfig;
}

function parseRemoteServerConfig(
   name: string,
   raw: Record<string, unknown>,
   warnings: string[],
): McpServerConfig | null {
   if (typeof raw.url !== 'string' || !raw.url) {
      warnings.push(`Skipping MCP server "${name}": remote server url must be a string`);
      return null;
   }

   const serverConfig: Record<string, unknown> = { url: raw.url };

   if (isStringRecord(raw.headers)) {
      serverConfig.headers = raw.headers;
   }
   addParsedCommonOptions(serverConfig, raw);

   return serverConfig as McpServerConfig;
}

function addParsedCommonOptions(
   target: Record<string, unknown>,
   raw: Record<string, unknown>,
): void {
   if (typeof raw.enabled === 'boolean') {
      target.enabled = raw.enabled;
   }
   if (typeof raw.timeout === 'number') {
      target.timeout = raw.timeout;
   }
}

function isStringRecord(value: unknown): value is Record<string, string> {
   if (!value || typeof value !== 'object') {
      return false;
   }

   return Object.values(value).every((item) => typeof item === 'string');
}
