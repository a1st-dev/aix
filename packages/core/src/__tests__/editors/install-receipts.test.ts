import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'pathe';
import { createEmptyConfig, type AiJsonConfig } from '@a1st/aix-schema';
import { parseTOML } from 'confbox';
import { installToEditor } from '../../editors/install.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('editor install receipts', () => {
   let projectRoot: string;

   beforeEach(async () => {
      projectRoot = await mkdtemp(join(tmpdir(), 'aix-receipts-'));
   });

   afterEach(async () => {
      vi.restoreAllMocks();
      await safeRm(projectRoot, { recursive: true, force: true });
   });

   it('removes a config contribution from every Claude section while preserving handwritten settings', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json'),
            mcpPath = join(projectRoot, '.mcp.json'),
            skillPath = join(projectRoot, 'source-skill'),
            handwritten = { matcher: '', hooks: [{ type: 'command', command: 'echo handwritten' }] },
            config: AiJsonConfig = {
               ...createEmptyConfig(),
               hooks: { agent_stop: [{ hooks: [{ command: 'echo managed' }] }] },
               mcp: { managed: { command: 'managed-server' } },
               rules: { managed: { content: 'Managed rules.' } },
               prompts: { managed: { content: 'Managed prompt.' } },
               agents: { managed: { content: 'Managed agent.' } },
               skills: { managed: skillPath },
               plugins: { 'managed@example': true },
               marketplaces: { managed: 'github:example/plugins' },
            };

      await mkdir(dirname(settingsPath), { recursive: true });
      await mkdir(skillPath);
      await writeFile(join(skillPath, 'SKILL.md'), '---\nname: managed\ndescription: Test skill\n---\nManaged skill.\n');
      await writeFile(settingsPath, JSON.stringify({
         model: 'handwritten-model', hooks: { Stop: [handwritten] }, enabledPlugins: { 'handwritten@example': true },
      }));
      await writeFile(mcpPath, JSON.stringify({ mcpServers: { handwritten: { command: 'handwritten-server' } } }));

      const installed = await installToEditor('claude-code', config, projectRoot),
            removed = await installToEditor('claude-code', createEmptyConfig(), projectRoot),
            settings = JSON.parse(await readFile(settingsPath, 'utf-8')),
            mcp = JSON.parse(await readFile(mcpPath, 'utf-8'));

      expect(installed.errors).toEqual([]);
      expect(removed.errors).toEqual([]);
      expect(settings.model).toBe('handwritten-model');
      expect(settings.hooks.Stop).toEqual([handwritten]);
      expect(settings.enabledPlugins).toEqual({ 'handwritten@example': true });
      expect(settings.extraKnownMarketplaces?.managed).toBeUndefined();
      expect(mcp.mcpServers).toEqual({ handwritten: { command: 'handwritten-server' } });
      expect(existsSync(join(projectRoot, '.claude', 'rules', 'managed.md'))).toBe(false);
      expect(existsSync(join(projectRoot, '.claude', 'commands', 'managed.md'))).toBe(false);
      expect(existsSync(join(projectRoot, '.claude', 'agents', 'managed.md'))).toBe(false);
      expect(existsSync(join(projectRoot, '.claude', 'skills', 'managed'))).toBe(false);
      expect(existsSync(join(projectRoot, '.aix', 'skills', 'managed'))).toBe(false);
      expect(existsSync(skillPath)).toBe(true);
   });

   it('replaces changed hooks and removes events that disappear from ai.json', async () => {
      const settingsPath = join(projectRoot, '.claude', 'settings.json'),
            oldConfig = { ...createEmptyConfig(), hooks: {
               agent_stop: [{ hooks: [{ command: 'echo old' }] }],
               subagent_stop: [{ hooks: [{ command: 'echo subagent' }] }],
            } },
            newConfig = { ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: 'echo new' }] }] } };

      await installToEditor('claude-code', oldConfig, projectRoot);
      const result = await installToEditor('claude-code', newConfig, projectRoot),
            settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(result.errors).toEqual([]);
      expect(settings.hooks.Stop).toEqual([{ matcher: '', hooks: [{ type: 'command', command: 'echo new' }] }]);
      expect(settings.hooks.SubagentStop).toEqual([]);
   });

   it('keeps shared entries until the last source config removes them', async () => {
      const settingsPath = join(homedir(), '.claude', 'settings.json'),
            config = { ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: 'echo shared' }] }] } },
            first = { targetScope: 'user' as const, configSource: join(projectRoot, 'first-ai.json') },
            second = { targetScope: 'user' as const, configSource: join(projectRoot, 'second-ai.json') };

      await installToEditor('claude-code', config, projectRoot, first);
      await installToEditor('claude-code', config, projectRoot, second);
      await installToEditor('claude-code', createEmptyConfig(), projectRoot, first);
      const shared = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(shared.hooks.Stop).toHaveLength(1);

      await installToEditor('claude-code', createEmptyConfig(), projectRoot, second);
      const removed = JSON.parse(await readFile(settingsPath, 'utf-8'));

      expect(removed.hooks.Stop).toEqual([]);
   });

   it('preserves user edits to previously installed entries and files', async () => {
      const config: AiJsonConfig = {
               ...createEmptyConfig(), mcp: { managed: { command: 'original' } }, rules: { managed: { content: 'Original.' } },
            },
            mcpPath = join(projectRoot, '.mcp.json'),
            rulePath = join(projectRoot, '.claude', 'rules', 'managed.md');

      await installToEditor('claude-code', config, projectRoot);
      await writeFile(mcpPath, JSON.stringify({ mcpServers: { managed: { command: 'user-edited' } } }));
      await writeFile(rulePath, 'User-edited rules.');
      await installToEditor('claude-code', createEmptyConfig(), projectRoot);

      expect(JSON.parse(await readFile(mcpPath, 'utf-8')).mcpServers.managed.command).toBe('user-edited');
      expect(await readFile(rulePath, 'utf-8')).toBe('User-edited rules.');
   });

   it('keeps content-based shared ownership after an older script copy disappears', async () => {
      const cached = join(projectRoot, 'cached.mjs'),
            checkout = join(projectRoot, 'checkout.mjs'),
            settingsPath = join(projectRoot, '.claude', 'settings.json'),
            first = { configSource: join(projectRoot, 'first-ai.json') },
            second = { configSource: join(projectRoot, 'second-ai.json') };

      await writeFile(cached, 'console.log("same script");');
      await writeFile(checkout, 'console.log("same script");');
      await installToEditor('claude-code', {
         ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: `node '${cached}'` }] }] },
      }, projectRoot, first);
      await installToEditor('claude-code', {
         ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: `node '${checkout}'` }] }] },
      }, projectRoot, second);
      await unlink(cached);
      await installToEditor('claude-code', createEmptyConfig(), projectRoot, second);

      expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.Stop).toHaveLength(1);

      await installToEditor('claude-code', createEmptyConfig(), projectRoot, first);

      expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.Stop).toEqual([]);
   });

   it('removes owned handlers from a mixed matcher group without removing a handwritten handler', async () => {
      const config = { ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: 'echo owned' }] }] } },
            path = join(projectRoot, '.claude', 'settings.json');

      await installToEditor('claude-code', config, projectRoot);
      await writeFile(path, JSON.stringify({ hooks: { Stop: [{ matcher: '', hooks: [
         { type: 'command', command: 'echo owned' }, { type: 'command', command: 'echo handwritten' },
      ] }] } }));
      await installToEditor('claude-code', createEmptyConfig(), projectRoot);

      expect(JSON.parse(await readFile(path, 'utf-8')).hooks.Stop).toEqual([
         { matcher: '', hooks: [{ type: 'command', command: 'echo handwritten' }] },
      ]);
   });

   it('restores another source contribution when an overriding MCP entry is removed', async () => {
      const first = { configSource: join(projectRoot, 'first-ai.json'), scopes: ['mcp'] as const },
            second = { configSource: join(projectRoot, 'second-ai.json'), scopes: ['mcp'] as const },
            configA: AiJsonConfig = { ...createEmptyConfig(), mcp: { shared: { command: 'first-server' } } },
            configB: AiJsonConfig = { ...createEmptyConfig(), mcp: { shared: { command: 'second-server' } } };

      await installToEditor('claude-code', configA, projectRoot, { ...first, scopes: [...first.scopes] });
      await installToEditor('claude-code', configB, projectRoot, { ...second, scopes: [...second.scopes] });
      await installToEditor('claude-code', createEmptyConfig(), projectRoot, { ...second, scopes: [...second.scopes] });

      expect(JSON.parse(await readFile(join(projectRoot, '.mcp.json'), 'utf-8')).mcpServers.shared.command).toBe('first-server');
   });

   it('preserves other sources in shared managed Markdown when a middle source disappears', async () => {
      const path = join(homedir(), '.claude', 'CLAUDE.md');

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'Handwritten instructions.\n');
      for (const name of ['first', 'second', 'third']) {
         const config: AiJsonConfig = { ...createEmptyConfig(), rules: { [name]: { content: `${name} instructions.` } } };

         // eslint-disable-next-line no-await-in-loop -- Source install order determines shared-section precedence.
         await installToEditor('claude-code', config, projectRoot, {
            targetScope: 'user', configSource: join(projectRoot, `${name}-ai.json`), scopes: ['rules'],
         });
      }
      await installToEditor('claude-code', createEmptyConfig(), projectRoot, {
         targetScope: 'user', configSource: join(projectRoot, 'second-ai.json'), scopes: ['rules'],
      });
      const content = await readFile(path, 'utf-8');

      expect(content).toContain('Handwritten instructions.');
      expect(content).toContain('/first.md');
      expect(content).toContain('/third.md');
      expect(content).not.toContain('/second.md');
   });

   it('retains receipts across --clean so removed skill links and hooks can still be reconciled', async () => {
      const skillPath = join(projectRoot, 'source-skill'),
            config: AiJsonConfig = {
               ...createEmptyConfig(), skills: { managed: skillPath },
               hooks: { agent_stop: [{ hooks: [{ command: 'echo owned' }] }] },
            };

      await mkdir(skillPath);
      await writeFile(join(skillPath, 'SKILL.md'), '---\nname: managed\ndescription: Test skill\n---\nManaged skill.\n');
      await installToEditor('claude-code', config, projectRoot);
      const result = await installToEditor('claude-code', createEmptyConfig(), projectRoot, { clean: true });

      expect(result.errors).toEqual([]);
      expect(JSON.parse(await readFile(join(projectRoot, '.claude', 'settings.json'), 'utf-8')).hooks.Stop).toEqual([]);
      expect(result.changes).toContainEqual(expect.objectContaining({
         path: join(projectRoot, '.claude', 'skills', 'managed'), action: 'delete', isDirectory: true,
      }));
   });

   it('previews cleanup without advancing receipts or removing other sections', async () => {
      const config: AiJsonConfig = {
               ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: 'echo old' }] }] },
               mcp: { managed: { command: 'server' } },
            },
            directory = join(projectRoot, '.aix', 'installs'),
            settingsPath = join(projectRoot, '.claude', 'settings.json');

      await installToEditor('claude-code', config, projectRoot);
      const [name] = await readdir(directory);

      expect(name).toBeDefined();

      const receiptPath = join(directory, name ?? ''),
            before = await readFile(receiptPath, 'utf-8'),
            preview = await installToEditor('claude-code', createEmptyConfig(), projectRoot, { dryRun: true, scopes: ['hooks'] }),
            change = preview.changes.find((entry) => {
               return entry.path === settingsPath;
            });

      expect(JSON.parse(change?.content ?? '{}').hooks.Stop).toEqual([]);
      expect(await readFile(receiptPath, 'utf-8')).toBe(before);
      expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.Stop).toHaveLength(1);

      await installToEditor('claude-code', createEmptyConfig(), projectRoot, { scopes: ['hooks'] });

      expect(JSON.parse(await readFile(join(projectRoot, '.mcp.json'), 'utf-8')).mcpServers.managed).toBeDefined();
   });

   it('rolls back editor cleanup if its receipt cannot be written', async () => {
      const config = { ...createEmptyConfig(), hooks: { agent_stop: [{ hooks: [{ command: 'echo old' }] }] } },
            settingsPath = join(projectRoot, '.claude', 'settings.json');

      await installToEditor('claude-code', config, projectRoot);
      const before = await readFile(settingsPath, 'utf-8'),
            fs = getRuntimeAdapter().fs,
            originalWrite = fs.writeFile.bind(fs);

      vi.spyOn(fs, 'writeFile').mockImplementation(async (path, content, encoding) => {
         if (path.includes('/installs/')) {
            throw new Error('receipt write failed');
         }
         await originalWrite(path, content, encoding);
      });

      const result = await installToEditor('claude-code', createEmptyConfig(), projectRoot);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('receipt write failed');
      expect(await readFile(settingsPath, 'utf-8')).toBe(before);
   });

   it('reconciles global-only Codex MCP entries when their source config changes', async () => {
      const config: AiJsonConfig = { ...createEmptyConfig(), mcp: { managed: { command: 'server' } } },
            options = { targetScope: 'user' as const, autoConfirmGlobal: true, scopes: ['mcp'] as const },
            path = join(homedir(), '.codex', 'config.toml');

      await installToEditor('codex', config, projectRoot, { ...options, scopes: [...options.scopes] });
      await installToEditor('codex', createEmptyConfig(), projectRoot, { ...options, scopes: [...options.scopes] });

      expect(parseTOML(await readFile(path, 'utf-8'))).toEqual({ mcp_servers: {} });
   });

   it('rolls back global MCP changes when their receipt cannot be written', async () => {
      const config: AiJsonConfig = { ...createEmptyConfig(), mcp: { managed: { command: 'original' } } },
            options = { targetScope: 'user' as const, autoConfirmGlobal: true, scopes: ['mcp'] as const },
            path = join(homedir(), '.codex', 'config.toml');

      await installToEditor('codex', config, projectRoot, { ...options, scopes: [...options.scopes] });
      const before = await readFile(path, 'utf-8'),
            fs = getRuntimeAdapter().fs,
            originalWrite = fs.writeFile.bind(fs);

      vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, content, encoding) => {
         if (filePath.includes('/installs/')) {
            throw new Error('receipt write failed');
         }
         await originalWrite(filePath, content, encoding);
      });
      const updated: AiJsonConfig = { ...createEmptyConfig(), mcp: { managed: { command: 'changed' } } },
            result = await installToEditor('codex', updated, projectRoot, { ...options, scopes: [...options.scopes] });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('receipt write failed');
      expect(await readFile(path, 'utf-8')).toBe(before);
   });
});
