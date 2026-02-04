import { describe, it, expect } from 'vitest';
import { KiroMcpStrategy } from '../../../editors/strategies/kiro/mcp.js';
import type { McpServerConfig } from '@a1st/aix-schema';

describe('KiroMcpStrategy', () => {
   const strategy = new KiroMcpStrategy();

   describe('basic properties', () => {
      it('returns supported', () => {
         expect(strategy.isSupported()).toBe(true);
      });

      it('is not global-only', () => {
         expect(strategy.isGlobalOnly()).toBe(false);
      });

      it('returns correct config path', () => {
         expect(strategy.getConfigPath()).toBe('settings/mcp.json');
      });

      it('returns correct global MCP config path', () => {
         expect(strategy.getGlobalMcpConfigPath()).toBe('.kiro/settings/mcp.json');
      });
   });

   describe('formatConfig', () => {
      it('formats command-based server', () => {
         const mcp: Record<string, McpServerConfig> = {
            filesystem: {
               command: 'npx',
               args: ['-y', '@modelcontextprotocol/server-filesystem'],
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.filesystem).toEqual({
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
         });
      });

      it('formats command-based server with env', () => {
         const mcp: Record<string, McpServerConfig> = {
            server: {
               command: 'node',
               args: ['server.js'],
               env: {
                  API_KEY: 'test-key',
                  DEBUG: 'true',
               },
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.server).toEqual({
            command: 'node',
            args: ['server.js'],
            env: {
               API_KEY: 'test-key',
               DEBUG: 'true',
            },
         });
      });

      it('formats URL-based server', () => {
         const mcp: Record<string, McpServerConfig> = {
            remote: {
               url: 'https://example.com/mcp',
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.remote).toEqual({
            url: 'https://example.com/mcp',
         });
      });

      it('excludes disabled servers', () => {
         const mcp: Record<string, McpServerConfig> = {
            enabled: {
               command: 'enabled-cmd',
            },
            disabled: {
               command: 'disabled-cmd',
               enabled: false,
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.enabled).toBeDefined();
         expect(parsed.mcpServers.disabled).toBeUndefined();
      });

      it('omits empty args array', () => {
         const mcp: Record<string, McpServerConfig> = {
            server: {
               command: 'cmd',
               args: [],
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.server.args).toBeUndefined();
      });

      it('omits empty env object', () => {
         const mcp: Record<string, McpServerConfig> = {
            server: {
               command: 'cmd',
               env: {},
            },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(parsed.mcpServers.server.env).toBeUndefined();
      });

      it('formats multiple servers', () => {
         const mcp: Record<string, McpServerConfig> = {
            server1: { command: 'cmd1' },
            server2: { command: 'cmd2', args: ['arg'] },
            server3: { url: 'https://example.com' },
         };

         const formatted = strategy.formatConfig(mcp);
         const parsed = JSON.parse(formatted);

         expect(Object.keys(parsed.mcpServers)).toHaveLength(3);
         expect(parsed.mcpServers.server1).toBeDefined();
         expect(parsed.mcpServers.server2).toBeDefined();
         expect(parsed.mcpServers.server3).toBeDefined();
      });

      it('produces valid JSON with newline', () => {
         const mcp: Record<string, McpServerConfig> = {
            test: { command: 'test' },
         };

         const formatted = strategy.formatConfig(mcp);

         expect(formatted.endsWith('\n')).toBe(true);
         expect(() => JSON.parse(formatted)).not.toThrow();
      });
   });

   describe('parseGlobalMcpConfig', () => {
      it('parses command-based server', () => {
         const content = JSON.stringify({
            mcpServers: {
               filesystem: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-filesystem'],
               },
            },
         });

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(warnings).toHaveLength(0);
         expect(mcp.filesystem).toEqual({
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
         });
      });

      it('parses server with env', () => {
         const content = JSON.stringify({
            mcpServers: {
               server: {
                  command: 'node',
                  args: ['server.js'],
                  env: {
                     API_KEY: 'test-key',
                  },
               },
            },
         });

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(warnings).toHaveLength(0);
         expect(mcp.server).toBeDefined();

         if (mcp.server && 'env' in mcp.server) {
            expect(mcp.server.env).toEqual({ API_KEY: 'test-key' });
         }
      });

      it('parses URL-based server', () => {
         const content = JSON.stringify({
            mcpServers: {
               remote: {
                  url: 'https://example.com/mcp',
               },
            },
         });

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(warnings).toHaveLength(0);
         expect(mcp.remote).toEqual({ url: 'https://example.com/mcp' });
      });

      it('skips servers with unknown format', () => {
         const content = JSON.stringify({
            mcpServers: {
               valid: { command: 'valid-cmd' },
               invalid: { unknown: 'field' },
            },
         });

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(mcp.valid).toBeDefined();
         expect(mcp.invalid).toBeUndefined();
         expect(warnings).toHaveLength(1);
         expect(warnings[0]).toContain('invalid');
      });

      it('handles missing mcpServers object', () => {
         const content = JSON.stringify({});

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(mcp).toEqual({});
         expect(warnings).toHaveLength(0);
      });

      it('handles invalid JSON', () => {
         const content = 'invalid json {';

         const { mcp, warnings } = strategy.parseGlobalMcpConfig(content);

         expect(mcp).toEqual({});
         expect(warnings).toHaveLength(1);
         expect(warnings[0]).toContain('Failed to parse');
      });

      it('handles empty args array', () => {
         const content = JSON.stringify({
            mcpServers: {
               server: {
                  command: 'cmd',
                  args: [],
               },
            },
         });

         const { mcp } = strategy.parseGlobalMcpConfig(content);

         expect(mcp.server).toBeDefined();

         if (mcp.server && 'args' in mcp.server) {
            expect(mcp.server.args).toBeUndefined();
         }
      });

      it('handles empty env object', () => {
         const content = JSON.stringify({
            mcpServers: {
               server: {
                  command: 'cmd',
                  env: {},
               },
            },
         });

         const { mcp } = strategy.parseGlobalMcpConfig(content);

         expect(mcp.server).toBeDefined();

         if (mcp.server && 'env' in mcp.server) {
            expect(mcp.server.env).toBeUndefined();
         }
      });
   });

   describe('round trip', () => {
      it('formats then parses command-based server', () => {
         const original: Record<string, McpServerConfig> = {
            test: {
               command: 'test-cmd',
               args: ['arg1', 'arg2'],
               env: { KEY: 'value' },
            },
         };

         const formatted = strategy.formatConfig(original);
         const { mcp } = strategy.parseGlobalMcpConfig(formatted);

         expect(mcp.test).toEqual(original.test);
      });

      it('formats then parses URL-based server', () => {
         const original: Record<string, McpServerConfig> = {
            remote: {
               url: 'https://example.com/mcp',
            },
         };

         const formatted = strategy.formatConfig(original);
         const { mcp } = strategy.parseGlobalMcpConfig(formatted);

         expect(mcp.remote).toEqual(original.remote);
      });

      it('formats then parses multiple servers', () => {
         const original: Record<string, McpServerConfig> = {
            server1: { command: 'cmd1', args: ['a'] },
            server2: { url: 'https://example.com' },
            server3: { command: 'cmd3', env: { K: 'v' } },
         };

         const formatted = strategy.formatConfig(original);
         const { mcp } = strategy.parseGlobalMcpConfig(formatted);

         expect(mcp.server1).toEqual(original.server1);
         expect(mcp.server2).toEqual(original.server2);
         expect(mcp.server3).toEqual(original.server3);
      });
   });
});
