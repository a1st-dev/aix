import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
   NoPluginsStrategy,
   NoMarketplacesStrategy,
   PluginCompatibilityStrategy,
   unpackPluginDirectory,
   unpackAllPlugins,
   hasPluginsConfigPath,
   hasMarketplacesConfigPath,
} from '../../editors/strategies/shared/index.js';
import { ClaudeCodePluginsStrategy, ClaudeCodeMarketplacesStrategy } from '../../editors/strategies/claude-code/index.js';
import { CursorPluginsStrategy, CursorMarketplacesStrategy } from '../../editors/strategies/cursor/index.js';
import { CopilotPluginsStrategy, CopilotMarketplacesStrategy } from '../../editors/strategies/copilot/index.js';
import { OpenCodePluginsStrategy } from '../../editors/strategies/opencode/index.js';
import { CursorAdapter, ClaudeCodeAdapter, WindsurfAdapter } from '../../editors/adapters/index.js';
import { safeRm } from '../../fs/safe-rm.js';
import { createEmptyConfig, type PluginsConfig, type MarketplacesConfig, type AiJsonConfig } from '@a1st/aix-schema';

describe('NoPluginsStrategy', () => {
   const strategy = new NoPluginsStrategy();

   it('reports itself as not supported', () => {
      expect(strategy.isSupported()).toStrictEqual(false);
   });

   it('returns empty string for formatConfig', () => {
      const plugins: PluginsConfig = {
         'test-plugin': true,
      };

      expect(strategy.formatConfig(plugins)).toStrictEqual('');
   });

   it('returns empty string for getConfigPath', () => {
      expect(strategy.getConfigPath()).toStrictEqual('');
   });

   it('returns all plugin keys as unsupported', () => {
      const plugins: PluginsConfig = {
         'test-plugin': true,
         'other-plugin': { enabled: false },
      };

      expect(strategy.getUnsupportedPlugins(plugins)).toEqual(['test-plugin', 'other-plugin']);
   });
});

describe('NoMarketplacesStrategy', () => {
   const strategy = new NoMarketplacesStrategy();

   it('reports itself as not supported', () => {
      expect(strategy.isSupported()).toStrictEqual(false);
   });

   it('returns empty string for formatConfig', () => {
      const marketplaces: MarketplacesConfig = {
         official: 'https://github.com/org/plugins',
      };

      expect(strategy.formatConfig(marketplaces)).toStrictEqual('');
   });

   it('returns empty string for getConfigPath', () => {
      expect(strategy.getConfigPath()).toStrictEqual('');
   });

   it('returns all marketplace keys as unsupported', () => {
      const marketplaces: MarketplacesConfig = {
         official: 'https://github.com/org/plugins',
         custom: { source: 'local/path' },
      };

      expect(strategy.getUnsupportedMarketplaces(marketplaces)).toEqual(['official', 'custom']);
   });
});

describe('ClaudeCodePluginsStrategy', () => {
   const strategy = new ClaudeCodePluginsStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns settings.json as config path', () => {
      expect(strategy.getConfigPath()).toStrictEqual('settings.json');
      expect(strategy.getGlobalConfigPath()).toStrictEqual('.claude/settings.json');
   });

   it('formats enabled plugins correctly', () => {
      const plugins: PluginsConfig = {
         'code-review': true,
         'disabled-plugin': false,
         'configured-plugin': { enabled: true, marketplace: 'claude-plugins-official' },
         'shorthand-plugin@custom-mkt': true,
      };

      const parsed = JSON.parse(strategy.formatConfig(plugins)) as { enabledPlugins: Record<string, boolean> };

      expect(parsed.enabledPlugins['code-review']).toStrictEqual(true);
      expect(parsed.enabledPlugins['disabled-plugin']).toStrictEqual(false);
      expect(parsed.enabledPlugins['configured-plugin@claude-plugins-official']).toStrictEqual(true);
      expect(parsed.enabledPlugins['shorthand-plugin@custom-mkt']).toStrictEqual(true);
   });

   it('returns empty array for unsupported plugins', () => {
      expect(strategy.getUnsupportedPlugins({ 'any-plugin': true })).toEqual([]);
   });
});

describe('ClaudeCodeMarketplacesStrategy', () => {
   const strategy = new ClaudeCodeMarketplacesStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns settings.json as config path', () => {
      expect(strategy.getConfigPath()).toStrictEqual('settings.json');
      expect(strategy.getGlobalConfigPath()).toStrictEqual('.claude/settings.json');
   });

   it('formats github shorthand and URLs correctly', () => {
      const marketplaces: MarketplacesConfig = {
         official: 'github:anthropics/claude-plugins-official',
         community: 'https://github.com/org/community-plugins.git',
         local: './plugins/local-mkt',
         disabled: false,
      };

      const parsed = JSON.parse(strategy.formatConfig(marketplaces)) as {
         extraKnownMarketplaces: Record<string, { source: { source: string; [k: string]: unknown } }>;
      };

      expect(parsed.extraKnownMarketplaces.official).toEqual({
         source: { source: 'github', repo: 'anthropics/claude-plugins-official' },
      });
      expect(parsed.extraKnownMarketplaces.community).toEqual({
         source: { source: 'github', repo: 'org/community-plugins' },
      });
      expect(parsed.extraKnownMarketplaces.local).toEqual({
         source: { source: 'directory', path: './plugins/local-mkt' },
      });
      expect(parsed.extraKnownMarketplaces.disabled).toBeUndefined();
   });

   it('formats object sources correctly', () => {
      const marketplaces: MarketplacesConfig = {
         custom: {
            source: { git: 'https://github.com/my-org/my-plugins' },
            enabled: true,
         },
         disabledObj: {
            source: 'github:org/repo',
            enabled: false,
         },
      };

      const parsed = JSON.parse(strategy.formatConfig(marketplaces)) as {
         extraKnownMarketplaces: Record<string, { source: { source: string; [k: string]: unknown } }>;
      };

      expect(parsed.extraKnownMarketplaces.custom).toEqual({
         source: { source: 'github', repo: 'my-org/my-plugins' },
      });
      expect(parsed.extraKnownMarketplaces.disabledObj).toBeUndefined();
   });

   it('returns empty array for unsupported marketplaces', () => {
      expect(strategy.getUnsupportedMarketplaces({ official: 'github:org/repo' })).toEqual([]);
   });
});

describe('OpenCodePluginsStrategy', () => {
   const strategy = new OpenCodePluginsStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns opencode.json as project root config path', () => {
      expect(strategy.getConfigPath()).toStrictEqual('opencode.json');
      expect(strategy.isProjectRootConfig()).toStrictEqual(true);
      expect(strategy.getGlobalConfigPath()).toStrictEqual('.config/opencode/opencode.json');
   });

   it('formats active plugins array and filters disabled ones', () => {
      const plugins: PluginsConfig = {
         'opencode-plugin-test': true,
         'disabled-plugin': false,
         '@scoped/pkg': true,
         'plugin-with-mkt@marketplace': true,
         'configured-plugin': { source: 'local-path', enabled: true },
         'disabled-configured': { source: 'other-path', enabled: false },
      };

      const parsed = JSON.parse(strategy.formatConfig(plugins)) as { plugins: string[] };

      expect(parsed.plugins).toContain('opencode-plugin-test');
      expect(parsed.plugins).toContain('@scoped/pkg');
      expect(parsed.plugins).toContain('plugin-with-mkt');
      expect(parsed.plugins).toContain('local-path');
      expect(parsed.plugins).not.toContain('disabled-plugin');
      expect(parsed.plugins).not.toContain('disabled-configured');
   });
});

describe('PluginCompatibilityStrategy', () => {
   const strategy = new PluginCompatibilityStrategy();

   it('reports itself as supported because it unpacks components', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns empty string for formatConfig and getConfigPath', () => {
      expect(strategy.formatConfig({ 'test-plugin': true })).toStrictEqual('');
      expect(strategy.getConfigPath()).toStrictEqual('');
   });

   it('reports no unsupported plugins in compatibility mode', () => {
      expect(strategy.getUnsupportedPlugins({ 'test-plugin': true })).toEqual([]);
   });
});

describe('plugin unpacking', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-plugin-unpack-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('unpacks skills, mcp servers, and rules from a plugin directory', async () => {
      const pluginDir = join(testDir, 'sample-plugin'),
            skillsDir = join(pluginDir, 'skills', 'helper'),
            rulesDir = join(pluginDir, 'rules');

      await mkdir(skillsDir, { recursive: true });
      await mkdir(rulesDir, { recursive: true });

      await writeFile(join(skillsDir, 'SKILL.md'), '# Helper Skill\nDescription of skill', 'utf-8');
      await writeFile(
         join(pluginDir, '.mcp.json'),
         JSON.stringify({ mcpServers: { db: { command: 'node', args: ['db.js'] } } }),
         'utf-8',
      );
      await writeFile(join(rulesDir, 'coding-style.md'), '# Coding style rule', 'utf-8');

      const unpacked = await unpackPluginDirectory('sample', pluginDir);

      expect(unpacked.skills['sample-helper']).toEqual({ path: skillsDir });
      expect(unpacked.mcp['sample-db']).toEqual({ command: 'node', args: ['db.js'] });
      expect(unpacked.rules['sample-coding-style']).toEqual({ content: '# Coding style rule' });
   });

   it('unpacks root SKILL.md when skills subdir does not exist', async () => {
      const pluginDir = join(testDir, 'single-skill-plugin');

      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'SKILL.md'), '# Single Skill\nContent', 'utf-8');

      const unpacked = await unpackPluginDirectory('single', pluginDir);

      expect(unpacked.skills.single).toEqual({ path: pluginDir });
   });

   it('aggregates components across multiple configured plugins', async () => {
      const pluginA = join(testDir, 'plugin-a'),
            pluginB = join(testDir, 'plugin-b');

      await mkdir(pluginA, { recursive: true });
      await mkdir(pluginB, { recursive: true });

      await writeFile(join(pluginA, 'SKILL.md'), '# Skill A', 'utf-8');
      await writeFile(
         join(pluginB, 'mcp.json'),
         JSON.stringify({ git: { command: 'git-server' } }),
         'utf-8',
      );

      const plugins: PluginsConfig = {
         'first-plugin': './plugin-a',
         'second-plugin': { source: './plugin-b', enabled: true },
         'disabled-plugin': { source: './plugin-a', enabled: false },
      };

      const result = await unpackAllPlugins(plugins, testDir);

      expect(result.skills['first-plugin']).toEqual({ path: pluginA });
      expect(result.mcp['second-plugin-git']).toEqual({ command: 'git-server' });
      expect(result.skills['disabled-plugin']).toBeUndefined();
   });
});

describe('CursorPluginsStrategy', () => {
   const strategy = new CursorPluginsStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns .cursor-plugin/plugin.json as project root config path', () => {
      expect(strategy.getConfigPath()).toStrictEqual('.cursor-plugin/plugin.json');
      expect(strategy.isProjectRootConfig()).toStrictEqual(true);
   });

   it('formats plugins map correctly', () => {
      const plugins: PluginsConfig = {
         'active-plugin': true,
         'disabled-plugin': false,
         'configured-plugin': { enabled: true, options: { model: 'fast' } },
      };

      const parsed = JSON.parse(strategy.formatConfig(plugins)) as { plugins: Record<string, unknown> };

      expect(parsed.plugins['active-plugin']).toStrictEqual(true);
      expect(parsed.plugins['disabled-plugin']).toStrictEqual(false);
      expect(parsed.plugins['configured-plugin']).toEqual({ enabled: true, options: { model: 'fast' } });
   });
});

describe('CursorMarketplacesStrategy', () => {
   const strategy = new CursorMarketplacesStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns .cursor-plugin/marketplace.json as project root config path', () => {
      expect(strategy.getConfigPath()).toStrictEqual('.cursor-plugin/marketplace.json');
      expect(strategy.isProjectRootConfig()).toStrictEqual(true);
   });

   it('formats marketplaces map correctly', () => {
      const marketplaces: MarketplacesConfig = {
         team: 'https://marketplace.example.com',
         disabled: false,
         custom: { source: 'local/mkt', enabled: true, description: 'Team catalog' },
      };

      const parsed = JSON.parse(strategy.formatConfig(marketplaces)) as { marketplaces: Record<string, unknown> };

      expect(parsed.marketplaces.team).toEqual({ source: 'https://marketplace.example.com' });
      expect(parsed.marketplaces.disabled).toBeUndefined();
      expect(parsed.marketplaces.custom).toEqual({ source: 'local/mkt', description: 'Team catalog' });
   });
});

describe('CopilotPluginsStrategy', () => {
   const strategy = new CopilotPluginsStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns config paths for project and user scopes', () => {
      expect(strategy.getConfigPath()).toStrictEqual('copilot-plugins.json');
      expect(strategy.getGlobalConfigPath()).toStrictEqual('.config/github-copilot/plugins.json');
   });

   it('formats plugins map correctly', () => {
      const plugins: PluginsConfig = {
         'copilot-plugin': true,
         'disabled-plugin': false,
      };

      const parsed = JSON.parse(strategy.formatConfig(plugins)) as { plugins: Record<string, unknown> };

      expect(parsed.plugins['copilot-plugin']).toStrictEqual(true);
      expect(parsed.plugins['disabled-plugin']).toStrictEqual(false);
   });
});

describe('CopilotMarketplacesStrategy', () => {
   const strategy = new CopilotMarketplacesStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toStrictEqual(true);
   });

   it('returns config paths for project and user scopes', () => {
      expect(strategy.getConfigPath()).toStrictEqual('copilot-marketplaces.json');
      expect(strategy.getGlobalConfigPath()).toStrictEqual('.config/github-copilot/marketplaces.json');
   });

   it('formats marketplaces map correctly', () => {
      const marketplaces: MarketplacesConfig = {
         corp: 'https://copilot.internal/catalog',
         disabled: false,
      };

      const parsed = JSON.parse(strategy.formatConfig(marketplaces)) as { marketplaces: Record<string, unknown> };

      expect(parsed.marketplaces.corp).toEqual({ source: 'https://copilot.internal/catalog' });
      expect(parsed.marketplaces.disabled).toBeUndefined();
   });
});

describe('hasPluginsConfigPath & hasMarketplacesConfigPath', () => {
   it('detects scope availability for Claude Code', () => {
      const plugins = new ClaudeCodePluginsStrategy(),
            marketplaces = new ClaudeCodeMarketplacesStrategy();

      expect(hasPluginsConfigPath(plugins, 'project')).toStrictEqual(true);
      expect(hasPluginsConfigPath(plugins, 'user')).toStrictEqual(true);
      expect(hasMarketplacesConfigPath(marketplaces, 'project')).toStrictEqual(true);
      expect(hasMarketplacesConfigPath(marketplaces, 'user')).toStrictEqual(true);
   });

   it('detects scope availability for Cursor', () => {
      const plugins = new CursorPluginsStrategy(),
            marketplaces = new CursorMarketplacesStrategy();

      expect(hasPluginsConfigPath(plugins, 'project')).toStrictEqual(true);
      expect(hasPluginsConfigPath(plugins, 'user')).toStrictEqual(false);
      expect(hasMarketplacesConfigPath(marketplaces, 'project')).toStrictEqual(true);
      expect(hasMarketplacesConfigPath(marketplaces, 'user')).toStrictEqual(false);
   });

   it('detects scope availability for OpenCode', () => {
      const plugins = new OpenCodePluginsStrategy();

      expect(hasPluginsConfigPath(plugins, 'project')).toStrictEqual(true);
      expect(hasPluginsConfigPath(plugins, 'user')).toStrictEqual(true);
   });

   it('detects scope availability for PluginCompatibilityStrategy', () => {
      const plugins = new PluginCompatibilityStrategy();

      expect(hasPluginsConfigPath(plugins, 'project')).toStrictEqual(true);
      expect(hasPluginsConfigPath(plugins, 'user')).toStrictEqual(false);
   });

   it('returns false for unsupported strategies', () => {
      const plugins = new NoPluginsStrategy(),
            marketplaces = new NoMarketplacesStrategy();

      expect(hasPluginsConfigPath(plugins, 'project')).toStrictEqual(false);
      expect(hasPluginsConfigPath(plugins, 'user')).toStrictEqual(false);
      expect(hasMarketplacesConfigPath(marketplaces, 'project')).toStrictEqual(false);
      expect(hasMarketplacesConfigPath(marketplaces, 'user')).toStrictEqual(false);
   });
});

describe('TargetScopeLimitations for plugins and marketplaces', () => {
   const config: AiJsonConfig = {
      ...createEmptyConfig(),
      plugins: {
         'sample-plugin': true,
      },
      marketplaces: {
         corp: 'https://corp.internal/catalog',
      },
   };

   it('reports user-scope limitations for Cursor', () => {
      const adapter = new CursorAdapter(),
            projectLimits = adapter.getTargetScopeLimitations(config, 'project'),
            userLimits = adapter.getTargetScopeLimitations(config, 'user');

      expect(projectLimits.plugins).toBeUndefined();
      expect(projectLimits.marketplaces).toBeUndefined();
      expect(userLimits.plugins?.plugins).toEqual(['sample-plugin']);
      expect(userLimits.marketplaces?.marketplaces).toEqual(['corp']);
   });

   it('reports no scope limitations for Claude Code', () => {
      const adapter = new ClaudeCodeAdapter(),
            projectLimits = adapter.getTargetScopeLimitations(config, 'project'),
            userLimits = adapter.getTargetScopeLimitations(config, 'user');

      expect(projectLimits.plugins).toBeUndefined();
      expect(projectLimits.marketplaces).toBeUndefined();
      expect(userLimits.plugins).toBeUndefined();
      expect(userLimits.marketplaces).toBeUndefined();
   });

   it('reports user-scope plugin limitation for Windsurf compatibility unpacker', () => {
      const adapter = new WindsurfAdapter(),
            projectLimits = adapter.getTargetScopeLimitations(config, 'project'),
            userLimits = adapter.getTargetScopeLimitations(config, 'user');

      expect(projectLimits.plugins).toBeUndefined();
      expect(userLimits.plugins?.plugins).toEqual(['sample-plugin']);
   });
});

describe('Compatibility unpacking in non-native adapters', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-compat-adapter-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir);
   });

   it('unpacks local plugin components into WindsurfAdapter config at project scope', async () => {
      const pluginDir = join(testDir, 'my-plugin'),
            rulesDir = join(pluginDir, 'rules');

      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'code-quality.md'), '# Code Quality Rules\nFollow guidelines.', 'utf-8');
      await writeFile(
         join(pluginDir, '.mcp.json'),
         JSON.stringify({ mcpServers: { db: { command: 'node', args: ['server.js'] } } }),
         'utf-8',
      );

      const config: AiJsonConfig = {
         ...createEmptyConfig(),
         plugins: {
            'my-plugin': './my-plugin',
         },
      };

      const adapter = new WindsurfAdapter(),
            result = await adapter.generateConfig(config, testDir, { targetScope: 'project' });

      // Rules should contain the unpacked plugin rule
      const unpackedRule = result.rules.find((r) => r.name?.includes('my-plugin-code-quality'));

      expect(unpackedRule).toBeDefined();
      expect(unpackedRule?.content).toContain('# Code Quality Rules');

      // MCP should contain the unpacked server
      const server = result.mcp['my-plugin-db'];

      expect(server).toBeDefined();
      if (server && 'command' in server) {
         expect(server.command).toStrictEqual('node');
      }
   });
});
