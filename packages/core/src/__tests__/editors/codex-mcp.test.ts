import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { parseTOML } from 'confbox';
import type { McpServerConfig } from '@a1st/aix-schema';
import { CodexMcpStrategy } from '../../editors/strategies/codex/mcp.js';
import { removeFromGlobalMcpConfig } from '../../global/processor.js';

const EXISTING_TOML = `model = "o3"
model_provider = "openai"

[projects]
[projects."/Users/test/project"]
trust_level = "trusted"
`;

const createMcpServer = (command: string, args: string[] = []): McpServerConfig => {
   const config: Record<string, unknown> = { command };

   if (args.length > 0) {
      config.args = args;
   }
   return config as McpServerConfig;
};

/**
 * Redirect homedir() to a temp directory so backupGlobalConfig (which writes to ~/.aix/backups/)
 * never touches the real home directory during tests.
 */
let fakeHome: string;

vi.mock('node:os', async (importOriginal) => {
   const actual = await importOriginal<typeof import('node:os')>();

   return { ...actual, homedir: () => fakeHome };
});

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

      it('skips disabled servers', () => {
         const output = strategy.formatConfig({
            active: createMcpServer('cmd1'),
            disabled: { command: 'cmd2', enabled: false } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: Record<string, unknown> };

         expect(parsed.mcp_servers).toHaveProperty('active');
         expect(parsed.mcp_servers).not.toHaveProperty('disabled');
      });

      it('handles URL-based servers', () => {
         const output = strategy.formatConfig({
            remote: { url: 'https://example.com/mcp' } as McpServerConfig,
         });

         const parsed = parseTOML(output) as { mcp_servers: Record<string, unknown> };

         expect(parsed.mcp_servers.remote).toEqual({ url: 'https://example.com/mcp' });
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

describe('TOML global MCP config operations', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-toml-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
      // Point homedir() into the temp dir so backupGlobalConfig writes there, not ~/
      fakeHome = join(testDir, 'fakehome');
      await mkdir(fakeHome, { recursive: true });
   });

   afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
   });

   describe('removeFromGlobalMcpConfig', () => {
      it('removes a server from TOML config while preserving other keys', async () => {
         const tomlPath = join(testDir, 'config.toml'),
               initialToml = `model = "o3"
model_provider = "openai"

[mcp_servers]
[mcp_servers.github]
command = "npx"
args = [ "-y", "@modelcontextprotocol/server-github" ]

[mcp_servers.filesystem]
command = "npx"
args = [ "-y", "@modelcontextprotocol/server-filesystem" ]
`;

         await writeFile(tomlPath, initialToml, 'utf-8');

         const removed = await removeFromGlobalMcpConfig(tomlPath, 'github');

         expect(removed).toBe(true);

         const result = await readFile(tomlPath, 'utf-8'),
               parsed = parseTOML(result) as Record<string, unknown>;

         // Preserved non-MCP keys
         expect(parsed.model).toBe('o3');
         expect(parsed.model_provider).toBe('openai');

         // Removed github, kept filesystem
         const servers = parsed.mcp_servers as Record<string, unknown>;

         expect(servers).not.toHaveProperty('github');
         expect(servers).toHaveProperty('filesystem');
      });

      it('returns false when server does not exist', async () => {
         const tomlPath = join(testDir, 'config.toml');

         await writeFile(tomlPath, EXISTING_TOML, 'utf-8');

         const removed = await removeFromGlobalMcpConfig(tomlPath, 'nonexistent');

         expect(removed).toBe(false);

         // File unchanged
         const result = await readFile(tomlPath, 'utf-8');

         expect(result).toBe(EXISTING_TOML);
      });

      it('returns false when file does not exist', async () => {
         const removed = await removeFromGlobalMcpConfig(join(testDir, 'missing.toml'), 'server');

         expect(removed).toBe(false);
      });
   });
});
