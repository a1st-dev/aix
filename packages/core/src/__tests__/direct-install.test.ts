import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
   redactDirectInstallConfig,
   resolveDirectInstallConfig,
} from '../direct-install.js';
import { safeRm } from '../fs/safe-rm.js';
import { nodeRuntimeAdapter, withRuntimeAdapter, type RuntimeAdapter } from '../runtime/index.js';

describe('direct install config resolution', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-direct-install-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('resolves a remote MCP URL to HTTP config', async () => {
      const result = await resolveDirectInstallConfig({
         type: 'mcp',
         source: 'https://example.com/mcp',
         name: 'docs',
         cwd: testDir,
         mcp: {
            headers: {
               Authorization: 'Bearer ${DOCS_TOKEN}',
            },
         },
      });

      expect(result.sections).toEqual(['mcp']);
      expect(result.config.mcp.docs).toEqual({
         url: 'https://example.com/mcp',
         headers: {
            Authorization: 'Bearer ${DOCS_TOKEN}',
         },
      });
   });

   it('redacts direct install env and header values', async () => {
      const result = await resolveDirectInstallConfig({
         type: 'mcp',
         name: 'docs',
         cwd: testDir,
         mcp: {
            command: 'npx docs-mcp',
            env: {
               TOKEN: '${TOKEN}',
            },
         },
      });

      const redacted = redactDirectInstallConfig(result.config);

      expect(redacted.mcp.docs).toEqual({
         command: 'npx docs-mcp',
         env: {
            TOKEN: '<redacted>',
         },
      });
   });

   it('resolves a GitHub URL of a SKILL.md file to the skill directory', async () => {
      const result = await resolveDirectInstallConfig({
         type: 'skill',
         source: 'https://github.com/org/repo/blob/main/skills/brainstorming/SKILL.md',
         cwd: testDir,
      });

      expect(result.name).toBe('brainstorming');
      expect(result.config.skills).toEqual({
         brainstorming: { git: 'https://github.com/org/repo', ref: 'main', path: 'skills/brainstorming' },
      });
   });

   it('names a skill whose SKILL.md is at the repository root after the repository', async () => {
      const result = await resolveDirectInstallConfig({
         type: 'skill',
         source: 'https://github.com/org/pdf-tools/blob/main/SKILL.md',
         cwd: testDir,
      });

      expect(result.name).toBe('pdf-tools');
      expect(result.config.skills).toEqual({ 'pdf-tools': { git: 'https://github.com/org/pdf-tools', ref: 'main' } });
   });

   it('resolves a local prompt source', async () => {
      await writeFile(join(testDir, 'review.md'), 'Review this code.', 'utf-8');

      const result = await resolveDirectInstallConfig({
         type: 'prompt',
         source: './review.md',
         name: 'review',
         cwd: testDir,
         prompt: {
            description: 'Review code',
            argumentHint: '[file]',
         },
      });

      expect(result.sections).toEqual(['prompts']);
      expect(result.config.prompts.review).toEqual({
         path: './review.md',
         description: 'Review code',
         argumentHint: '[file]',
      });
   });

   it('resolves a local agent source', async () => {
      await writeFile(
         join(testDir, 'reviewer.md'),
         '---\nname: reviewer\ndescription: Review pull requests\nmode: subagent\n---\nReview this code carefully.',
         'utf-8',
      );

      const result = await resolveDirectInstallConfig({
         type: 'agent',
         source: './reviewer.md',
         name: 'reviewer',
         cwd: testDir,
         agent: {
            model: 'sonnet',
            tools: ['Read', 'Grep'],
         },
      });

      expect(result.sections).toEqual(['agents']);
      expect(result.config.agents.reviewer).toEqual({
         path: './reviewer.md',
         mode: 'subagent',
         model: 'sonnet',
         tools: ['Read', 'Grep'],
      });
   });

   it('normalizes a direct hook fragment', async () => {
      await writeFile(
         join(testDir, 'pre-command.jsonc'),
         JSON.stringify({
            event: 'pre_command',
            matcher: 'git commit',
            hooks: [{ command: 'npm run standards' }],
         }),
         'utf-8',
      );

      const result = await resolveDirectInstallConfig({
         type: 'hook',
         source: './pre-command.jsonc',
         cwd: testDir,
      });

      expect(result.sections).toEqual(['hooks']);
      expect(result.config.hooks?.pre_command).toEqual([
         {
            matcher: 'git commit',
            hooks: [{ command: 'npm run standards' }],
         },
      ]);
   });

   it('resolves a hook from an npm package convention', async () => {
      const packageRoot = join(testDir, 'node_modules', '@company', 'hooks');

      await mkdir(join(packageRoot, 'hooks'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), '{"name":"@company/hooks"}', 'utf-8');
      await writeFile(
         join(packageRoot, 'hooks', 'pre-command.jsonc'),
         JSON.stringify({
            event: 'pre_command',
            hooks: [{ command: 'npm run standards' }],
         }),
         'utf-8',
      );

      const adapter = createRuntimeAdapter({
         npm: {
            ...nodeRuntimeAdapter.npm,
            resolvePackagePath: vi.fn(async () => {
               return join(packageRoot, 'package.json');
            }),
         },
      });

      const result = await withRuntimeAdapter(adapter, async () => {
         return resolveDirectInstallConfig({
            type: 'hook',
            source: 'npm:@company/hooks',
            name: 'pre-command',
            cwd: testDir,
         });
      });

      expect(result.config.hooks?.pre_command).toEqual([
         {
            hooks: [{ command: 'npm run standards' }],
         },
      ]);
   });

   describe('MCP config files', () => {
      async function resolveMcpFile(content: unknown, name?: string): Promise<Record<string, unknown>> {
         await writeFile(join(testDir, 'servers.json'), JSON.stringify(content), 'utf-8');

         const result = await resolveDirectInstallConfig({
            type: 'mcp',
            source: './servers.json',
            name,
            cwd: testDir,
         });

         return result.config.mcp;
      }

      it('uses the only server in an mcpServers file without needing its name', async () => {
         const mcp = await resolveMcpFile({ mcpServers: { docs: { command: 'npx docs-mcp' } } });

         expect(mcp).toEqual({ servers: { command: 'npx docs-mcp' } });
      });

      it('uses the only server in an mcp file without needing its name', async () => {
         const mcp = await resolveMcpFile({ mcp: { docs: { command: 'npx docs-mcp' }, disabled: false } });

         expect(mcp).toEqual({ servers: { command: 'npx docs-mcp' } });
      });

      it('selects the named server from an mcpServers file with several', async () => {
         const mcpServers = { docs: { command: 'npx docs-mcp' }, search: { url: 'https://example.com/mcp' } },
               mcp = await resolveMcpFile({ mcpServers }, 'search');

         expect(mcp).toEqual({ search: { url: 'https://example.com/mcp' } });
      });

      it('asks for a name only when the file really has several servers', async () => {
         const mcpServers = { docs: { command: 'npx docs-mcp' }, search: { url: 'https://example.com/mcp' } };

         await expect(resolveMcpFile({ mcpServers })).rejects.toThrow('MCP config contains multiple servers');
      });

      it('does not report several servers when the only entry is not a server config', async () => {
         await expect(resolveMcpFile({ mcpServers: { docs: { description: 'No command or url' } } })).rejects.toThrow(
            'MCP config does not contain a server with a command or url',
         );
      });
   });

   it('resolves an MCP config from a git shorthand source', async () => {
      const adapter = createRuntimeAdapter({
         git: {
            downloadTemplate: vi.fn(async (_template, options) => {
               const dir = options.dir ?? testDir;

               await mkdir(join(dir, 'mcp'), { recursive: true });
               await writeFile(
                  join(dir, 'mcp', 'docs.jsonc'),
                  JSON.stringify({ command: 'npx docs-mcp' }),
                  'utf-8',
               );

               return { dir };
            }),
         },
      });

      const result = await withRuntimeAdapter(adapter, async () => {
         return resolveDirectInstallConfig({
            type: 'mcp',
            source: 'github:company/aix-pack',
            name: 'docs',
            cwd: testDir,
         });
      });

      expect(result.config.mcp.docs).toEqual({
         command: 'npx docs-mcp',
      });
   });
});

function createRuntimeAdapter(overrides: Partial<RuntimeAdapter>): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      ...overrides,
   };
}
