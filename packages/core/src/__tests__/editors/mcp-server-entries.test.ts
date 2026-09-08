import { describe, it, expect } from 'vitest';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../../editors/strategies/types.js';
import { ClaudeCodeMcpStrategy } from '../../editors/strategies/claude-code/mcp.js';
import { CodexMcpStrategy } from '../../editors/strategies/codex/mcp.js';
import { CopilotMcpStrategy } from '../../editors/strategies/copilot/mcp.js';
import { AntigravityMcpStrategy } from '../../editors/strategies/antigravity/mcp.js';
import { OpenCodeMcpStrategy } from '../../editors/strategies/opencode/mcp.js';
import { StandardMcpStrategy } from '../../editors/strategies/shared/standard-mcp.js';
import { WindsurfMcpStrategy } from '../../editors/strategies/windsurf/mcp.js';
import { ZedMcpStrategy } from '../../editors/strategies/zed/mcp.js';

const REMOTE_SERVER: McpServerConfig = {
         url: 'https://example.com/mcp',
         headers: { Authorization: 'Bearer secret' },
      },
      STDIO_SERVER: McpServerConfig = {
         command: 'npx',
         args: [ '-y', '@modelcontextprotocol/server-github' ],
         env: { GITHUB_TOKEN: 'secret' },
      };

/**
 * Every editor names a server's transport, endpoint, and credentials differently, but a config
 * written for one and read back has to come out unchanged for all of them.
 */
const STRATEGIES: ReadonlyArray<{ name: string; strategy: McpStrategy }> = [
   { name: 'cursor', strategy: new StandardMcpStrategy() },
   { name: 'claude-code', strategy: new ClaudeCodeMcpStrategy() },
   { name: 'codex', strategy: new CodexMcpStrategy() },
   { name: 'copilot', strategy: new CopilotMcpStrategy() },
   { name: 'antigravity', strategy: new AntigravityMcpStrategy() },
   { name: 'opencode', strategy: new OpenCodeMcpStrategy() },
   { name: 'windsurf', strategy: new WindsurfMcpStrategy() },
   { name: 'zed', strategy: new ZedMcpStrategy() },
];

describe('MCP server entries', () => {
   describe.each(STRATEGIES)('$name', ({ strategy }) => {
      it('keeps auth headers on a remote server through a write and read round trip', () => {
         const result = strategy.parseGlobalMcpConfig(strategy.formatConfig({ docs: REMOTE_SERVER }));

         expect(result.warnings).toEqual([]);
         expect(result.mcp.docs).toEqual(REMOTE_SERVER);
      });

      it('keeps command, args, and env on a stdio server through a write and read round trip', () => {
         const result = strategy.parseGlobalMcpConfig(strategy.formatConfig({ github: STDIO_SERVER }));

         expect(result.warnings).toEqual([]);
         expect(result.mcp.github).toEqual(STDIO_SERVER);
      });

      it('writes the auth header into the config file', () => {
         expect(strategy.formatConfig({ docs: REMOTE_SERVER })).toContain('Bearer secret');
      });

      it('warns instead of importing an entry with neither a command nor a URL', () => {
         const config = strategy.formatConfig({ docs: REMOTE_SERVER })
                  .replace(/"(url|httpUrl|serverUrl)":/g, '"endpoint":')
                  .replace(/^(url|httpUrl|serverUrl) =/gm, 'endpoint ='),
               result = strategy.parseGlobalMcpConfig(config);

         expect(result.mcp).toEqual({});
         expect(result.warnings).toHaveLength(1);
         expect(result.warnings[0]).toContain('docs');
      });
   });

   describe('editor-specific entry shapes', () => {
      it('writes Claude Code stdio and http transport types', () => {
         const written = JSON.parse(new ClaudeCodeMcpStrategy().formatConfig({
            docs: REMOTE_SERVER,
            github: STDIO_SERVER,
         }));

         expect(written.mcpServers.docs.type).toBe('http');
         expect(written.mcpServers.github.type).toBe('stdio');
      });

      it('writes GitHub Copilot local and http transport types', () => {
         const written = JSON.parse(new CopilotMcpStrategy().formatConfig({
            docs: REMOTE_SERVER,
            github: STDIO_SERVER,
         }));

         expect(written.mcpServers.docs.type).toBe('http');
         expect(written.mcpServers.github.type).toBe('local');
      });

      it('names the Codex auth settings an import cannot carry', () => {
         const toml = `[mcp_servers.docs]
url = "https://example.com/mcp"
auth = "oauth"
scopes = ["read"]
`;

         const result = new CodexMcpStrategy().parseGlobalMcpConfig(toml);

         expect(result.mcp.docs).toEqual({ url: 'https://example.com/mcp' });
         expect(result.warnings).toHaveLength(1);
         expect(result.warnings[0]).toContain('auth, scopes');
      });

      it('round-trips a disabled Windsurf server rather than dropping it', () => {
         const strategy = new WindsurfMcpStrategy(),
               server: McpServerConfig = { command: 'cmd', enabled: false } as McpServerConfig,
               { mcp } = strategy.parseGlobalMcpConfig(strategy.formatConfig({ off: server }));

         expect(JSON.parse(strategy.formatConfig({ off: server })).mcpServers.off.disabled).toBe(true);
         expect(mcp.off).toEqual(server);
      });

      it('round-trips Windsurf disabled tools', () => {
         const strategy = new WindsurfMcpStrategy(),
               server: McpServerConfig = { command: 'cmd', disabledTools: [ 'write' ] } as McpServerConfig,
               { mcp } = strategy.parseGlobalMcpConfig(strategy.formatConfig({ github: server }));

         expect(mcp.github).toEqual(server);
      });

      it('imports a Windsurf remote server declared with serverUrl', () => {
         const content = JSON.stringify({
                  mcpServers: {
                     docs: { serverUrl: 'https://example.com/mcp', headers: { Authorization: 'Bearer secret' } },
                  },
               }),
               result = new WindsurfMcpStrategy().parseGlobalMcpConfig(content);

         expect(result.warnings).toEqual([]);
         expect(result.mcp.docs).toEqual(REMOTE_SERVER);
      });

      it('writes Zed context servers with args and env always present on local servers', () => {
         const written = JSON.parse(new ZedMcpStrategy().formatConfig({
            bare: { command: 'my-server' },
         }));

         expect(written.context_servers.bare).toEqual({ command: 'my-server', args: [], env: {} });
      });

      it('imports a Zed remote context server that an editor wrote by hand', () => {
         const content = JSON.stringify({
                  context_servers: {
                     docs: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer secret' } },
                  },
               }),
               result = new ZedMcpStrategy().parseGlobalMcpConfig(content);

         expect(result.warnings).toEqual([]);
         expect(result.mcp.docs).toEqual(REMOTE_SERVER);
      });

      it('writes an Antigravity stdio server to standard command, args, and env fields', () => {
         const written = JSON.parse(new AntigravityMcpStrategy().formatConfig({ github: STDIO_SERVER }));

         expect(written.mcpServers.github).toEqual({
            command: 'npx',
            args: [ '-y', '@modelcontextprotocol/server-github' ],
            env: { GITHUB_TOKEN: 'secret' },
         });
      });
   });
});
