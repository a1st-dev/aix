import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { parseStringRecord } from './mcp-import-utils.js';

/**
 * Values some editors write in each entry's `type` field to name the transport. Claude Code
 * uses `stdio` and `http`; GitHub Copilot uses `local` and `http`.
 */
export interface TransportTypeNames {
   readonly stdio: string;
   readonly http: string;
}

/**
 * How one editor's entries differ from the common shape.
 */
export interface StandardServerEntryOptions {
   /** Transport names for the `type` field. Omit for the editors that have no such field. */
   readonly transportTypes?: TransportTypeNames;
   /**
    * Keys that can hold a remote server's endpoint, most preferred first. The first is the one
    * written; reading accepts any of them. Gemini CLI names its streamable HTTP endpoint
    * `httpUrl` and Windsurf documents `serverUrl`, while most editors use `url`.
    */
   readonly urlKeys?: readonly string[];
}

const DEFAULT_URL_KEYS = [ 'url' ] as const;

/**
 * Build one `mcpServers` entry in the shape shared by Cursor, Claude Code, Gemini CLI,
 * GitHub Copilot, Windsurf, and Zed: `command` with optional `args` and `env` for stdio
 * servers, a URL with optional `headers` for remote ones. Empty maps and arrays are left out
 * so the written config stays shorthand.
 */
export function buildStandardServerEntry(
   serverConfig: McpServerConfig,
   options: StandardServerEntryOptions = {},
): Record<string, unknown> {
   const server: Record<string, unknown> = {},
         transportTypes = options.transportTypes;

   if ('command' in serverConfig) {
      if (transportTypes) {
         server.type = transportTypes.stdio;
      }
      server.command = serverConfig.command;

      if (serverConfig.args && serverConfig.args.length > 0) {
         server.args = serverConfig.args;
      }
      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
         server.env = serverConfig.env;
      }

      return server;
   }

   if (transportTypes) {
      server.type = transportTypes.http;
   }
   server[options.urlKeys?.[0] ?? DEFAULT_URL_KEYS[0]] = serverConfig.url;

   if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
      server.headers = serverConfig.headers;
   }

   return server;
}

/**
 * Read one `mcpServers` entry written in the shape produced by
 * {@link buildStandardServerEntry}. Returns null when the entry names neither a command nor a
 * URL, so each caller can word its own "unknown format" warning.
 */
export function parseStandardServerEntry(
   server: unknown,
   options: StandardServerEntryOptions = {},
): McpServerConfig | null {
   if (!isRecord(server)) {
      return null;
   }

   if (typeof server.command === 'string') {
      const parsed: McpServerConfig = { command: server.command },
            env = parseStringRecord(server.env);

      if (Array.isArray(server.args) && server.args.length > 0) {
         parsed.args = server.args.map(String);
      }
      if (env) {
         parsed.env = env;
      }

      return parsed;
   }

   const url = getRemoteUrl(server, options.urlKeys ?? DEFAULT_URL_KEYS);

   if (url) {
      const parsed: McpServerConfig = { url },
            headers = parseStringRecord(server.headers);

      if (headers) {
         parsed.headers = headers;
      }

      return parsed;
   }

   return null;
}

function getRemoteUrl(
   server: Record<string, unknown>,
   urlKeys: readonly string[],
): string | undefined {
   for (const key of urlKeys) {
      const value = server[key];

      if (typeof value === 'string' && value) {
         return value;
      }
   }

   return undefined;
}

/**
 * Standard MCP strategy used by Cursor. Uses `mcp.json` with a `mcpServers` object. Claude Code
 * extends this with {@link ClaudeCodeMcpStrategy} for its `.mcp.json` (dot-prefixed) filename.
 */
export class StandardMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'mcp.json';
   }

   isProjectRootConfig(): boolean {
      return false;
   }

   getGlobalMcpConfigPath(): string | null {
      return '.cursor/mcp.json';
   }

   formatConfig(mcp: Record<string, McpServerConfig>): string {
      const mcpServers: Record<string, unknown> = {};

      for (const [name, serverConfig] of Object.entries(mcp)) {
         if (serverConfig.enabled === false) {
            continue;
         }

         mcpServers[name] = buildStandardServerEntry(serverConfig);
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
            const serverConfig = parseStandardServerEntry(server);

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
}
