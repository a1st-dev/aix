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
