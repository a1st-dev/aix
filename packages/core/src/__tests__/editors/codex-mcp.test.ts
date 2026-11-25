import { describe, it, expect } from 'vitest';
import { parseTOML } from 'confbox';
import type { McpServerConfig } from '@a1st/aix-schema';
import { CodexMcpStrategy } from '../../editors/strategies/codex/mcp.js';

const createMcpServer = (command: string, args: string[] = []): McpServerConfig => {
   const config: Record<string, unknown> = { command };

   if (args.length > 0) {
      config.args = args;
   }
   return config as McpServerConfig;
};

describe('CodexMcpStrategy', () => {
   const strategy = new CodexMcpStrategy();

   describe('formatConfig', () => {
      it('produces valid TOML with mcp_servers section', () => {
         const output = strategy.formatConfig({
            github: createMcpServer('npx', ['-y', '@modelcontextprotocol/server-github']),
         });

         const parsed = parseTOML(output) as Record<string, unknown>;

         expect(parsed).toHaveProperty('mcp_servers');
         expect((parsed.mcp_servers as Record<string, unknown>).github).toEqual({
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
         });
      });

      it('keeps a disabled server in the file, marked disabled', () => {
         const output = strategy.formatConfig({
            active: createMcpServer('cmd1'),
            off: { command: 'cmd2', enabled: false } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: Record<string, Record<string, unknown>> };

         expect(parsed.mcp_servers.active).toEqual({ command: 'cmd1' });
         expect(parsed.mcp_servers.off).toEqual({ command: 'cmd2', enabled: false });
      });

      it('round-trips a disabled server rather than dropping it', () => {
         const server: McpServerConfig = { command: 'cmd2', enabled: false } as McpServerConfig,
               { mcp } = strategy.parseGlobalMcpConfig(strategy.formatConfig({ off: server }));

         expect(mcp.off).toEqual(server);
      });

      it('handles URL-based servers', () => {
         const output = strategy.formatConfig({
            remote: { url: 'https://example.com/mcp' } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: Record<string, unknown> };

         expect(parsed.mcp_servers.remote).toEqual({ url: 'https://example.com/mcp' });
      });

      it('writes literal header values to http_headers', () => {
         const output = strategy.formatConfig({
            docs: { url: 'https://example.com/mcp', headers: { 'X-Tenant': 'acme' } } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: { docs: Record<string, unknown> } };

         expect(parsed.mcp_servers.docs).toEqual({
            url: 'https://example.com/mcp',
            http_headers: { 'X-Tenant': 'acme' },
         });
      });

      it('writes an env var header reference to env_http_headers', () => {
         const output = strategy.formatConfig({
            docs: { url: 'https://example.com/mcp', headers: { 'X-Api-Key': '${DOCS_KEY}' } } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: { docs: Record<string, unknown> } };

         expect(parsed.mcp_servers.docs).toEqual({
            url: 'https://example.com/mcp',
            env_http_headers: { 'X-Api-Key': 'DOCS_KEY' },
         });
      });

      it('writes a bearer token header to bearer_token_env_var', () => {
         const output = strategy.formatConfig({
            docs: {
               url: 'https://example.com/mcp',
               headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
            } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: { docs: Record<string, unknown> } };

         expect(parsed.mcp_servers.docs).toEqual({
            url: 'https://example.com/mcp',
            bearer_token_env_var: 'DOCS_TOKEN',
         });
      });

      it('writes a header value that mixes text and an env var reference verbatim', () => {
         const output = strategy.formatConfig({
            docs: { url: 'https://example.com/mcp', headers: { 'X-Api-Key': 'key-${SUFFIX}' } } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: { docs: Record<string, unknown> } };

         expect(parsed.mcp_servers.docs.http_headers).toEqual({ 'X-Api-Key': 'key-${SUFFIX}' });
      });

      it('never writes header fields on a stdio server, which Codex rejects', () => {
         const output = strategy.formatConfig({
            github: createMcpServer('npx', ['-y', 'server']),
         });

         expect(output).not.toContain('http_headers');
         expect(output).not.toContain('bearer_token_env_var');
      });

      it('includes env when present', () => {
         const output = strategy.formatConfig({
            github: {
               command: 'npx',
               args: ['-y', '@modelcontextprotocol/server-github'],
               env: { GITHUB_TOKEN: 'tok_123' },
            } as McpServerConfig,
         });

         const parsed = parseTOML(output) as {
            mcp_servers: { github: { env: Record<string, string> } };
         };

         expect(parsed.mcp_servers.github.env).toEqual({ GITHUB_TOKEN: 'tok_123' });
      });
   });

   describe('parseGlobalMcpConfig', () => {
      it('reads http_headers, env_http_headers, and bearer_token_env_var into one headers map', () => {
         const toml = `[mcp_servers.docs]
url = "https://example.com/mcp"
bearer_token_env_var = "DOCS_TOKEN"

[mcp_servers.docs.http_headers]
X-Tenant = "acme"

[mcp_servers.docs.env_http_headers]
X-Api-Key = "DOCS_KEY"
`;

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(toml);

         expect(warnings).toEqual([]);
         expect(mcp.docs).toEqual({
            url: 'https://example.com/mcp',
            headers: {
               'X-Tenant': 'acme',
               'X-Api-Key': '${DOCS_KEY}',
               Authorization: 'Bearer ${DOCS_TOKEN}',
            },
         });
      });

      it('leaves a remote server without auth fields as a bare url', () => {
         const { mcp } = strategy.parseGlobalMcpConfig('[mcp_servers.docs]\nurl = "https://example.com/mcp"\n');

         expect(mcp.docs).toEqual({ url: 'https://example.com/mcp' });
      });

      it.each([
         [ 'a literal header', { 'X-Tenant': 'acme' } ],
         [ 'an env var header reference', { 'X-Api-Key': '${DOCS_KEY}' } ],
         [ 'a bearer token', { Authorization: 'Bearer ${DOCS_TOKEN}' } ],
         [ 'every header form at once', {
            'X-Tenant': 'acme',
            'X-Api-Key': '${DOCS_KEY}',
            Authorization: 'Bearer ${DOCS_TOKEN}',
         } ],
      ])('round-trips a remote server with %s', (_label, headers) => {
         const server: McpServerConfig = { url: 'https://example.com/mcp', headers },
               { mcp, warnings } = strategy.parseGlobalMcpConfig(strategy.formatConfig({ docs: server }));

         expect(warnings).toEqual([]);
         expect(mcp.docs).toEqual(server);
      });

      it('round-trips through format and parse', () => {
         const servers: Record<string, McpServerConfig> = {
            github: createMcpServer('npx', ['-y', '@modelcontextprotocol/server-github']),
            fs: createMcpServer('npx', ['-y', '@modelcontextprotocol/server-filesystem']),
         };

         const formatted = strategy.formatConfig(servers),
               { mcp, warnings } = strategy.parseGlobalMcpConfig(formatted);

         expect(warnings).toEqual([]);
         expect(mcp.github).toEqual({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] });
         expect(mcp.fs).toEqual({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] });
      });

      it('parses TOML with non-MCP keys without error', () => {
         const toml = `model = "o3"

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
`;

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(toml);

         expect(warnings).toEqual([]);
         expect(mcp.github).toEqual({
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
         });
      });

      it('returns warning for invalid TOML', () => {
         const { mcp, warnings } = strategy.parseGlobalMcpConfig('{invalid json}');

         expect(Object.keys(mcp)).toHaveLength(0);
         expect(warnings).toHaveLength(1);
         expect(warnings[0]).toContain('Failed to parse TOML');
      });
   });
});
