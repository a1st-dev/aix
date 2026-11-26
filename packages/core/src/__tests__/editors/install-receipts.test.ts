import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lstat, mkdtemp, mkdir, readFile, readdir, symlink, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'pathe';
import { createEmptyConfig, parseJsonc, type AiJsonConfig } from '@a1st/aix-schema';
import { parseTOML } from 'confbox';
import { installToEditor } from '../../editors/install.js';
import { importFromEditor } from '../../editors/import.js';
import { removeMcpFromEditor } from '../../editors/remove.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import * as ciEnvironment from '../../env/ci.js';
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

   it('manages nested OpenCode MCP in a mixed JSONC file and preserves unrelated settings', async () => {
      const path = join(projectRoot, 'opencode.jsonc'),
            timeout = { startup: 500, catalog: 1000, execution: 2000 },
            native = { type: 'remote', url: 'https://example.com/mcp', disabled: true, timeout, pool: true },
            legacy = { type: 'local', command: [ 'native-command' ] },
            initial = { mcp: { legacy, timeout, servers: { native } }, theme: 'example' },
            config: AiJsonConfig = {
               ...createEmptyConfig(),
               mcp: { managed: { url: 'https://example.org/mcp', editor: { opencode: { protocol: 'legacy', oauth: false } } } },
            };

      await writeFile(path, `// OpenCode settings\n${JSON.stringify(initial, null, 3)}\n`);
      const installed = await installToEditor('opencode', config, projectRoot),
            imported = await importFromEditor('opencode', { projectRoot, scope: 'project' }),
            removed = await removeMcpFromEditor('opencode', 'native', projectRoot);

      expect(installed.errors).to.eql([]);
      expect(imported.mcp).to.eql({
         legacy: { command: 'native-command' },
         native: { url: native.url, enabled: false, editor: { opencode: { timeout, pool: true } } },
         managed: config.mcp?.managed,
      });
      expect(removed.removed).toStrictEqual(true);

      await installToEditor('opencode', createEmptyConfig(), projectRoot);
      const content = await readFile(path, 'utf-8');

      expect(content).toContain('// OpenCode settings');
      expect(parseJsonc(content).data).to.eql({ ...initial, mcp: { legacy, timeout, servers: {} } });
      expect(existsSync(join(projectRoot, 'opencode.json'))).toStrictEqual(false);
   });

   it('uses the active Copilot home and still removes legacy-only MCP entries', async () => {
      const copilotHome = join(projectRoot, 'copilot-settings'),
            legacyPath = join(homedir(), '.config/github-copilot', 'mcp-config.json'),
            activePath = join(copilotHome, 'mcp-config.json'),
            settingsPath = join(copilotHome, 'settings.json'),
            target = join(projectRoot, 'user-mcp.json'),
            config: AiJsonConfig = {
               ...createEmptyConfig(),
               mcp: { shared: { command: 'active' } },
               rules: { language: { content: 'Use English.', activation: 'always' } },
               hooks: { pre_command: [{ hooks: [{ command: 'echo ready' }] }] },
               plugins: { 'printer@example': true },
               marketplaces: { example: 'github:example/plugins' },
            };

      vi.stubEnv('COPILOT_HOME', copilotHome);

      try {
         await mkdir(dirname(legacyPath), { recursive: true });
         await mkdir(copilotHome);
         await writeFile(legacyPath, JSON.stringify({ mcpServers: { shared: { command: 'legacy' }, old: { command: 'old' } } }));
         await writeFile(target, JSON.stringify({ mcpServers: { personal: { command: 'personal' } } }));
         await symlink(target, activePath);
         await writeFile(settingsPath, JSON.stringify({ trustedSetting: 'personal' }));

         const installed = await installToEditor('copilot', config, projectRoot, { targetScope: 'user' }),
               synced = await installToEditor('copilot', config, projectRoot, { targetScope: 'user' }),
               imported = await importFromEditor('copilot', { projectRoot, scope: 'user' }),
               removed = await removeMcpFromEditor('copilot', 'old', projectRoot, { targetScope: 'user' });

         expect(installed.errors).to.eql([]);
         expect(synced.errors).to.eql([]);
         expect((await lstat(activePath)).isSymbolicLink()).toStrictEqual(true);
         expect(imported.mcp.shared).to.eql({ command: 'active' });
         expect(imported.paths.mcp.old).toStrictEqual(legacyPath);
         expect(imported.paths.hooks.pre_command).toStrictEqual(join(copilotHome, 'hooks', 'hooks.json'));
         expect(imported.paths.rules.language).toStrictEqual(join(copilotHome, 'instructions', 'language.instructions.md'));
         expect(imported.plugins).to.eql(config.plugins);
         expect(imported.marketplaces).to.eql(config.marketplaces);
         expect(removed.removed).toStrictEqual(true);
         expect(parseJsonc(await readFile(settingsPath, 'utf-8')).data).toMatchObject({ trustedSetting: 'personal' });
         expect(parseJsonc(await readFile(target, 'utf-8')).data).toMatchObject({ mcpServers: { personal: { command: 'personal' } } });
      } finally {
         vi.unstubAllEnvs();
         await safeRm(dirname(legacyPath), { force: true });
      }
   });

   it('registers an opt-in Antigravity bundle without altering existing manifest entries', async () => {
      const pluginPath = join(projectRoot, 'managed-plugin'),
            manifestPath = join(homedir(), '.gemini/config/plugins.json'),
            handwritten = { path: './personal-plugins', exclude: [ 'hidden' ] },
            plugin = { source: { path: './managed-plugin' }, editor: { antigravity: { native: true } } },
            options = { targetScope: 'user' as const, strictTargetScope: true },
            config: AiJsonConfig = { ...createEmptyConfig(), plugins: { 'managed-plugin': plugin, 'legacy-plugin': './other' } };

      await mkdir(pluginPath);
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(join(pluginPath, 'plugin.json'), JSON.stringify({ name: 'managed-plugin', version: '1.0.0' }));
      await writeFile(manifestPath, JSON.stringify({ entries: [ handwritten ] }));

      try {
         const result = await installToEditor('antigravity', config, projectRoot, options),
               imported = await importFromEditor('antigravity', { projectRoot, scope: 'user' });

         expect(result.errors).to.eql([]);
         expect(imported.plugins['managed-plugin']).to.eql({ ...plugin, source: { path: pluginPath } });
         expect(parseJsonc(await readFile(manifestPath, 'utf-8')).data).to.eql({ entries: [ handwritten, { path: pluginPath } ] });

         await installToEditor('antigravity', createEmptyConfig(), projectRoot, options);

         expect(parseJsonc(await readFile(manifestPath, 'utf-8')).data).to.eql({ entries: [ handwritten ] });
         expect(existsSync(join(pluginPath, 'plugin.json'))).toStrictEqual(true);
      } finally {
         await unlink(manifestPath);
      }
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

   it('lists each Claude rule import once when several source configs share it', async () => {
      const path = join(homedir(), '.claude', 'CLAUDE.md'),
            sources = { first: ['shared', 'first'], second: ['shared', 'second'] };

      for (const [source, ruleNames] of Object.entries(sources)) {
         const rules = Object.fromEntries(ruleNames.map((name) => {
                  return [name, { content: `${name} instructions.` }];
               })),
               config: AiJsonConfig = { ...createEmptyConfig(), rules };

         // Installing twice proves repeat installs do not grow the section either.
         for (let attempt = 0; attempt < 2; attempt++) {
            // eslint-disable-next-line no-await-in-loop -- Each install reconciles against the previous receipts.
            await installToEditor('claude-code', config, projectRoot, {
               targetScope: 'user', configSource: join(projectRoot, `${source}-ai.json`), scopes: ['rules'],
            });
         }
      }
      const content = await readFile(path, 'utf-8');

      expect(content.match(/## aix rules/g)).toHaveLength(1);
      expect(content.match(/@rules\/shared\.md/g)).toHaveLength(1);
      expect(content).toContain('@rules/first.md');
      expect(content).toContain('@rules/second.md');
   });

   it('removes the skill links and hooks of a config that no longer declares them', async () => {
      const skillPath = join(projectRoot, 'source-skill'),
            config: AiJsonConfig = {
               ...createEmptyConfig(), skills: { managed: skillPath },
               hooks: { agent_stop: [{ hooks: [{ command: 'echo owned' }] }] },
            };

      await mkdir(skillPath);
      await writeFile(join(skillPath, 'SKILL.md'), '---\nname: managed\ndescription: Test skill\n---\nManaged skill.\n');
      await installToEditor('claude-code', config, projectRoot);
      const result = await installToEditor('claude-code', createEmptyConfig(), projectRoot);

      expect(result.errors).toEqual([]);
      expect(JSON.parse(await readFile(join(projectRoot, '.claude', 'settings.json'), 'utf-8')).hooks.Stop).toEqual([]);
      expect(result.changes).toContainEqual(expect.objectContaining({
         path: join(projectRoot, '.claude', 'skills', 'managed'), action: 'delete', isDirectory: true,
      }));
   });

   it('names a damaged receipt and how to recover, rather than failing with a parse error', async () => {
      const receiptPath = join(projectRoot, '.aix', 'installs', 'damaged.json');

      await mkdir(dirname(receiptPath), { recursive: true });
      await writeFile(receiptPath, '{ "version": 1, "files": [');

      const result = await installToEditor('claude-code', { ...createEmptyConfig(), mcp: { docs: { command: 'server' } } }, projectRoot);

      expect(result.success).toStrictEqual(false);
      expect(result.errors.join('\n')).toContain(receiptPath);
      expect(result.errors.join('\n')).toContain('Delete that file to continue');
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
            options = { targetScope: 'user' as const, scopes: ['mcp'] as const },
            path = join(homedir(), '.codex', 'config.toml');

      vi.spyOn(ciEnvironment, 'isCI').mockResolvedValue(false);

      await installToEditor('codex', config, projectRoot, { ...options, scopes: [...options.scopes] });
      await installToEditor('codex', createEmptyConfig(), projectRoot, { ...options, scopes: [...options.scopes] });

      expect(parseTOML(await readFile(path, 'utf-8'))).toEqual({ mcp_servers: {} });
   });

   it('rolls back global MCP changes when their receipt cannot be written', async () => {
      const config: AiJsonConfig = { ...createEmptyConfig(), mcp: { managed: { command: 'original' } } },
            options = { targetScope: 'user' as const, scopes: ['mcp'] as const },
            path = join(homedir(), '.codex', 'config.toml');

      vi.spyOn(ciEnvironment, 'isCI').mockResolvedValue(false);

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
