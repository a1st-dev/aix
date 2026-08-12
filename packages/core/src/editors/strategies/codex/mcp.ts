import type { McpServerConfig, McpServerConfigHttp } from '@a1st/aix-schema';
import { parseTOML, stringifyTOML } from 'confbox';
import { GlobalMcpStrategy } from '../shared/global-mcp.js';
import { isRecord } from '../../../type-guards.js';
import { parseStringRecord } from '../shared/mcp-import-utils.js';
import { buildStandardServerEntry, parseStandardServerEntry } from '../shared/standard-mcp.js';
import { getSoleEnvVarName } from '../../../mcp/env.js';

const AUTHORIZATION_HEADER = 'authorization',
      BEARER_PREFIX = 'Bearer ',
      /** Codex auth settings with no equivalent on our side, so an import cannot carry them. */
      UNSUPPORTED_AUTH_FIELDS = [ 'auth', 'oauth', 'oauth_resource', 'scopes' ] as const;

/**
 * Build a single Codex `[mcp_servers.name]` entry. Codex rejects any header field on a stdio
 * server, so those keys only ever go on a streamable HTTP entry. Codex can hold a server in a
 * disabled state, so a server turned off with us is written as `enabled = false` rather than
 * left out of the file.
 */
function buildCodexServerEntry(serverConfig: McpServerConfig): Record<string, unknown> {
   const server = 'command' in serverConfig
      ? buildStandardServerEntry(serverConfig)
      : buildCodexRemoteEntry(serverConfig);

   if (serverConfig.enabled === false) {
      server.enabled = false;
   }

   return server;
}

function buildCodexRemoteEntry(serverConfig: McpServerConfigHttp): Record<string, unknown> {
   const server: Record<string, unknown> = { url: serverConfig.url };

   if (serverConfig.headers) {
      addCodexHeaders(server, serverConfig.headers);
   }

   return server;
}

/**
 * Spread our `headers` map across the three keys Codex accepts on a streamable HTTP server.
 * Codex sends `http_headers` values verbatim and reads each `env_http_headers` value out of the
 * environment variable it names, so a header we hold as `${VAR}` has to move to the latter.
 * `Authorization: Bearer ${VAR}` has its own `bearer_token_env_var` field. A value mixing
 * literal text with a `${VAR}` reference cannot be expressed in any of the three, so it is
 * written verbatim rather than dropped, leaving the problem visible in the file.
 * Source: https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json
 */
function addCodexHeaders(target: Record<string, unknown>, headers: Record<string, string>): void {
   const literal: Record<string, string> = {},
         fromEnv: Record<string, string> = {};

   for (const [name, value] of Object.entries(headers)) {
      const bearerTokenEnvVar = getBearerTokenEnvVar(name, value),
            soleEnvVar = getSoleEnvVarName(value);

      if (bearerTokenEnvVar) {
         target.bearer_token_env_var = bearerTokenEnvVar;
      } else if (soleEnvVar) {
         fromEnv[name] = soleEnvVar;
      } else {
         literal[name] = value;
      }
   }

   if (Object.keys(literal).length > 0) {
      target.http_headers = literal;
   }
   if (Object.keys(fromEnv).length > 0) {
      target.env_http_headers = fromEnv;
   }
}

function getBearerTokenEnvVar(name: string, value: string): string | undefined {
   if (name.toLowerCase() !== AUTHORIZATION_HEADER || !value.startsWith(BEARER_PREFIX)) {
      return undefined;
   }

   return getSoleEnvVarName(value.slice(BEARER_PREFIX.length));
}

/**
 * Read one `[mcp_servers.name]` entry, folding Codex's three header fields back into a single
 * `headers` map. Header values Codex reads from the environment come back as `${VAR}` so they
 * survive a move to an editor that expands that syntax itself.
 */
function parseCodexServerEntry(server: unknown): McpServerConfig | null {
   const parsed = parseStandardServerEntry(server);

   if (!parsed || !isRecord(server)) {
      return parsed;
   }

   if (server.enabled === false) {
      parsed.enabled = false;
   }

   if ('command' in parsed) {
      return parsed;
   }

   const headers = parseCodexHeaders(server);

   if (headers) {
      parsed.headers = headers;
   }

   return parsed;
}

/**
 * Codex can authenticate a remote server through OAuth settings we have no field for. Naming
 * them keeps the gap visible instead of quietly handing another editor a server it cannot
 * connect to.
 */
function getUnsupportedAuthFields(server: unknown): string[] {
   if (!isRecord(server)) {
      return [];
   }

   return UNSUPPORTED_AUTH_FIELDS.filter((field) => {
      return server[field] !== undefined;
   });
}

function parseCodexHeaders(server: Record<string, unknown>): Record<string, string> | undefined {
   const headers: Record<string, string> = { ...parseStringRecord(server.http_headers) },
         fromEnv = parseStringRecord(server.env_http_headers) ?? {};

   for (const [name, envVar] of Object.entries(fromEnv)) {
      headers[name] = `\${${envVar}}`;
   }

   if (typeof server.bearer_token_env_var === 'string' && server.bearer_token_env_var) {
      headers.Authorization = `${BEARER_PREFIX}\${${server.bearer_token_env_var}}`;
   }

   if (Object.keys(headers).length === 0) {
      return undefined;
   }

   return headers;
}

/**
 * Format MCP config for Codex's config.toml format.
 * Codex uses TOML with [mcp_servers.name] sections.
 */
function formatCodexMcp(mcp: Record<string, McpServerConfig>): string {
   const mcpServers: Record<string, unknown> = {};

   for (const [name, serverConfig] of Object.entries(mcp)) {
      mcpServers[name] = buildCodexServerEntry(serverConfig);
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
         const serverConfig = parseCodexServerEntry(server);

         if (!serverConfig) {
            warnings.push(`Skipping MCP server "${name}": unknown format`);
            continue;
         }

         const unsupported = getUnsupportedAuthFields(server);

         if (unsupported.length > 0) {
            warnings.push(
               `MCP server "${name}" keeps Codex-only auth settings that cannot be imported: ${unsupported.join(', ')}`,
            );
         }

         mcp[name] = serverConfig;
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
         formatEntryFn: buildCodexServerEntry,
         parseFn: parseCodexMcp,
      });
   }
}
