import { openCodeMcpOptionsSchema, parseJsonc, type McpServerConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import type { McpStrategy } from '../types.js';
import { parseStringRecord } from '../shared/mcp-import-utils.js';
import { getOpenCodeConfigImportPaths } from './import-utils.js';
import { isRecord } from '../../../type-guards.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

function isServerEntry(value: unknown): boolean {
   return isRecord(value) && (value.type === 'local' || value.type === 'remote' || typeof value.enabled === 'boolean');
}

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

   getGlobalImportPaths(): readonly string[] {
      return getOpenCodeConfigImportPaths(this.getGlobalMcpConfigPath() ?? '.config/opencode/opencode.json');
   }

   getProjectImportPaths(projectRoot: string): readonly string[] {
      return getOpenCodeConfigImportPaths(join(projectRoot, this.getConfigPath()));
   }

   resolveConfigPath(defaultPath: string): string {
      const { fs } = getRuntimeAdapter();

      return getOpenCodeConfigImportPaths(defaultPath).find((path) => fs.existsSync(path)) ?? defaultPath;
   }

   getJsonServerPaths(config: Record<string, unknown>, name: string): string[][] {
      if (!isRecord(config.mcp)) {
         return [];
      }
      const mcp = config.mcp,
            native = getNativeOpenCodeMcpServers(mcp),
            paths: string[][] = [];

      if (native && Object.hasOwn(native, name)) {
         paths.push([ 'mcp', 'servers', name ]);
      }
      if (Object.hasOwn(mcp, name) && ((name !== 'servers' && name !== 'timeout') || isServerEntry(mcp[name]))) {
         paths.push([ 'mcp', name ]);
      }
      return paths;
   }

   formatConfig(mcp: Record<string, McpServerConfig>, existing?: Record<string, unknown>): string {
      const current = isRecord(existing?.mcp) ? existing.mcp : {},
            native = getNativeOpenCodeMcpServers(current),
            hasNativeLayout = native !== undefined || (isRecord(current.timeout) && !isServerEntry(current.timeout)),
            flatServers: Record<string, unknown> = {},
            nativeServers: Record<string, unknown> = {};

      for (const [name, server] of Object.entries(mcp)) {
         const existingFlat = isServerEntry(current[name]) && !Object.hasOwn(native ?? {}, name),
               useNative = Boolean(server.editor?.opencode || (hasNativeLayout && !existingFlat));

         if (useNative && isServerEntry(current.servers)) {
            throw new Error('Cannot add an OpenCode v2 MCP server while a legacy server is named "servers"');
         }

         const output = useNative ? nativeServers : flatServers;

         Object.defineProperty(output, name, { enumerable: true, value: formatServerConfig(server, useNative) });
      }

      if (Object.keys(nativeServers).length > 0) {
         if (Object.hasOwn(flatServers, 'servers')) {
            throw new Error('Cannot combine OpenCode v2 MCP options with a legacy server named "servers"');
         }
         flatServers.servers = nativeServers;
      }

      const metadata = existing ? {} : { $schema: 'https://opencode.ai/config.json' };

      return JSON.stringify({ ...metadata, mcp: flatServers }, null, 2) + '\n';
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

         const servers = parsed.data.mcp ?? {},
               native = getNativeOpenCodeMcpServers(servers),
               entries = [
                  ...Object.entries(servers).filter(([name, value]) => {
                     return (name !== 'servers' && name !== 'timeout') || isServerEntry(value);
                  }),
                  ...Object.entries(native ?? {}),
               ];

         for (const [name, server] of entries) {
            const serverConfig = parseServerConfig(name, server, warnings);

            if (serverConfig) {
               Object.defineProperty(mcp, name, { configurable: true, enumerable: true, value: serverConfig });
            }
         }
      } catch (err) {
         warnings.push(`Failed to parse MCP config: ${(err as Error).message}`);
      }

      return { mcp, warnings };
   }
}

function getNativeOpenCodeMcpServers(mcp: Record<string, unknown>): Record<string, unknown> | undefined {
   return isRecord(mcp.servers) && !isServerEntry(mcp.servers) ? mcp.servers : undefined;
}

function formatServerConfig(serverConfig: McpServerConfig, useNative: boolean): Record<string, unknown> {
   if ('command' in serverConfig) {
      const server: Record<string, unknown> = {
         type: 'local',
         command: [serverConfig.command, ...(serverConfig.args ?? [])],
      };

      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
         server.environment = serverConfig.env;
      }
      if (useNative && serverConfig.cwd !== undefined) {
         server.cwd = serverConfig.cwd;
      }
      addCommonServerOptions(server, serverConfig, useNative);

      return server;
   }

   const server: Record<string, unknown> = {
      type: 'remote',
      url: serverConfig.url,
   };

   if (serverConfig.headers && Object.keys(serverConfig.headers).length > 0) {
      server.headers = serverConfig.headers;
   }
   addCommonServerOptions(server, serverConfig, useNative);

   return server;
}

function addCommonServerOptions(
   target: Record<string, unknown>,
   source: McpServerConfig,
   useNative: boolean,
): void {
   if (useNative) {
      const { oauth, ...options } = source.editor?.opencode ?? {};

      Object.assign(target, options);

      if (!('command' in source) && oauth !== undefined) {
         target.oauth = oauth;
      }
      if (source.enabled !== undefined) {
         target.disabled = !source.enabled;
      }
      if (!target.timeout && 'timeout' in source && source.timeout !== undefined) {
         target.timeout = { startup: source.timeout, catalog: source.timeout, execution: source.timeout };
      }

      return;
   }

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
         serverConfig: Record<string, unknown> = { command: commandParts[0] },
         env = parseStringRecord(raw.environment);

   if (commandParts.length > 1) {
      serverConfig.args = commandParts.slice(1);
   }
   if (env) {
      serverConfig.env = env;
   }
   if (typeof raw.cwd === 'string') {
      serverConfig.cwd = raw.cwd;
   }
   addParsedCommonOptions(serverConfig, raw, name, warnings);

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

   const serverConfig: Record<string, unknown> = { url: raw.url },
         headers = parseStringRecord(raw.headers);

   if (headers) {
      serverConfig.headers = headers;
   }
   addParsedCommonOptions(serverConfig, raw, name, warnings);

   return serverConfig as McpServerConfig;
}

function addParsedCommonOptions(
   target: Record<string, unknown>,
   raw: Record<string, unknown>,
   name: string,
   warnings: string[],
): void {
   if (typeof raw.disabled === 'boolean') {
      target.enabled = !raw.disabled;
   } else if (typeof raw.enabled === 'boolean') {
      target.enabled = raw.enabled;
   }
   if (typeof raw.timeout === 'number') {
      target.timeout = raw.timeout;
   }

   const { timeout, protocol, pool, codemode, oauth } = raw,
         options = openCodeMcpOptionsSchema.safeParse({
            ...(isRecord(timeout) ? { timeout } : {}),
            ...(protocol === undefined ? {} : { protocol }),
            ...(pool === undefined ? {} : { pool }),
            ...(codemode === undefined ? {} : { codemode }),
            ...(oauth === undefined ? {} : { oauth }),
         });

   if (!options.success) {
      const fields = options.error.issues.map((issue) => issue.path.join('.')).join(', ');

      warnings.push(`Skipping invalid OpenCode v2 options for MCP server "${name}": ${fields}`);
   } else if (Object.keys(options.data).length > 0) {
      target.editor = { opencode: options.data };
   }
}
