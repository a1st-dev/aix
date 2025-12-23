import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import type { AiJsonConfig, McpServerConfig } from '@a1st/aix-schema';
import {
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   VSCodeAdapter,
   ZedAdapter,
   CodexAdapter,
   getAdapter,
   getAvailableEditors,
   detectEditors,
   installToEditor,
} from '../../editors/index.js';
import { safeRm } from '../../fs/safe-rm.js';

const createMcpServer = (command: string, args: string[] = []): McpServerConfig => {
   const config: Record<string, unknown> = { command };

   if (args.length > 0) {
      config.args = args;
   }
   return config as McpServerConfig;
};

const createConfig = (overrides: Partial<AiJsonConfig> = {}): AiJsonConfig =>
   ({
      $schema: 'https://example.com/schema.json',
      skills: {},
      ...overrides,
   }) as AiJsonConfig;

describe('Editor Adapters', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-editor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   describe('getAvailableEditors', () => {
      it('returns all supported editors', () => {
         const editors = getAvailableEditors();

         expect(editors).toContain('windsurf');
         expect(editors).toContain('cursor');
         expect(editors).toContain('claude-code');
         expect(editors).toContain('vscode');
         expect(editors).toContain('zed');
         expect(editors).toContain('codex');
         expect(editors).toHaveLength(6);
      });
   });

   describe('getAdapter', () => {
      it('returns correct adapter for each editor', () => {
         expect(getAdapter('windsurf')).toBeInstanceOf(WindsurfAdapter);
         expect(getAdapter('cursor')).toBeInstanceOf(CursorAdapter);
         expect(getAdapter('claude-code')).toBeInstanceOf(ClaudeCodeAdapter);
         expect(getAdapter('vscode')).toBeInstanceOf(VSCodeAdapter);
         expect(getAdapter('zed')).toBeInstanceOf(ZedAdapter);
         expect(getAdapter('codex')).toBeInstanceOf(CodexAdapter);
      });

      it('throws for unknown editor', () => {
         expect(() => getAdapter('unknown' as never)).toThrow('Unknown editor');
      });
   });

   describe('detectEditors', () => {
      it('detects globally installed editors', async () => {
         // detectEditors now checks for global IDE installations (e.g., ~/Library/Application Support/Windsurf)
         // This test verifies the function runs without error - actual detection depends on what's installed
         const detected = await detectEditors(testDir);

         expect(Array.isArray(detected)).toBe(true);
         // All detected editors should be valid editor names
         for (const editor of detected) {
            expect(getAvailableEditors()).toContain(editor);
         }
      });
   });

   describe('WindsurfAdapter', () => {
      const adapter = new WindsurfAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('windsurf');
         expect(adapter.configDir).toBe('.windsurf');
      });

      it('detects when .windsurf directory exists', async () => {
         await mkdir(join(testDir, '.windsurf'), { recursive: true });
         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('does not detect when .windsurf directory is missing', async () => {
         expect(await adapter.detect(testDir)).toBe(false);
      });

      it('generates config with rules and MCP', async () => {
         const config = createConfig({
            rules: {
               typescript: { content: 'Use TypeScript' },
               'test-rule': { activation: 'always', content: 'Test content' },
            },
            mcp: {
               github: createMcpServer('npx', ['@mcp/github']),
            },
         });

         const editorConfig = await adapter.generateConfig(config, testDir);

         expect(editorConfig.rules).toHaveLength(2);
         expect(editorConfig.mcp).toHaveProperty('github');
      });

      it('writes rules as markdown files', async () => {
         const config = createConfig({
            rules: { 'my-rule': { activation: 'always', content: 'Rule content here' } },
         });

         const result = await installToEditor('windsurf', config, testDir);

         expect(result.success).toBe(true);
         expect(result.changes.some((c) => c.path.includes('my-rule.md'))).toBe(true);

         const ruleContent = await readFile(join(testDir, '.windsurf/rules/my-rule.md'), 'utf-8');

         expect(ruleContent).toContain('my-rule');
         expect(ruleContent).toContain('Rule content here');
      });

      // Note: Windsurf MCP is global-only (~/.codeium/windsurf/mcp_config.json), so project-level MCP is not supported

      it('respects dry-run option', async () => {
         const config = createConfig({
            rules: { 'test-rule': { content: 'Test rule' } },
         });

         const result = await installToEditor('windsurf', config, testDir, { dryRun: true });

         expect(result.success).toBe(true);
         expect(result.changes.length).toBeGreaterThan(0);
         // File should not exist in dry-run mode
         await expect(readFile(join(testDir, '.windsurf/rules/rule.md'), 'utf-8')).rejects.toThrow();
      });
   });

   describe('CursorAdapter', () => {
      const adapter = new CursorAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('cursor');
         expect(adapter.configDir).toBe('.cursor');
      });

      it('writes rules with YAML frontmatter', async () => {
         const config = createConfig({
            rules: {
               'cursor-rule': {
                  activation: 'auto',
                  description: 'Auto-applied rule',
                  content: 'Rule content',
               },
            },
         });

         await installToEditor('cursor', config, testDir);

         const ruleContent = await readFile(join(testDir, '.cursor/rules/cursor-rule.mdc'), 'utf-8');

         expect(ruleContent).toContain('---');
         expect(ruleContent).toContain('alwaysApply: false');
         expect(ruleContent).toContain('description: "Auto-applied rule"');
         expect(ruleContent).toContain('Rule content');
      });

      it('writes MCP config to mcp.json', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         await installToEditor('cursor', config, testDir);

         const mcpContent = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.server).toBeDefined();
      });
   });

   describe('ClaudeCodeAdapter', () => {
      const adapter = new ClaudeCodeAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('claude-code');
         expect(adapter.configDir).toBe('.claude');
      });

      it('writes rules with optional frontmatter', async () => {
         const config = createConfig({
            rules: {
               'claude-rule': {
                  activation: 'glob',
                  globs: ['*.ts', '*.tsx'],
                  content: 'TypeScript rule',
               },
            },
         });

         await installToEditor('claude-code', config, testDir);

         const ruleContent = await readFile(join(testDir, '.claude/rules/claude-rule.md'), 'utf-8');

         expect(ruleContent).toContain('paths:');
         expect(ruleContent).toContain('*.ts');
         expect(ruleContent).toContain('TypeScript rule');
      });
   });

   describe('VSCodeAdapter', () => {
      const adapter = new VSCodeAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('vscode');
         // configDir is .vscode for MCP; rules/prompts use relative paths to .github/
         expect(adapter.configDir).toBe('.vscode');
      });

      it('writes rules to .github/instructions/', async () => {
         const config = createConfig({
            rules: { 'vscode-rule': { content: 'VS Code rule' } },
         });

         await installToEditor('vscode', config, testDir);

         const ruleContent = await readFile(
            join(testDir, '.github/instructions/vscode-rule.instructions.md'),
            'utf-8',
         );

         expect(ruleContent).toContain('VS Code rule');
      });
   });

   describe('ZedAdapter', () => {
      const adapter = new ZedAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('zed');
         expect(adapter.configDir).toBe('.zed');
      });

      it('writes rules to single .rules file at project root', async () => {
         const config = createConfig({
            rules: {
               'zed-rule': {
                  description: 'A rule for Zed',
                  activation: 'always',
                  content: 'Zed content',
               },
            },
         });

         await installToEditor('zed', config, testDir);

         // Zed uses a single .rules file at project root, not .zed/rules/
         const ruleContent = await readFile(join(testDir, '.rules'), 'utf-8');

         expect(ruleContent).toContain('# zed-rule');
         expect(ruleContent).toContain('Zed content');
      });
   });

   describe('CodexAdapter', () => {
      const adapter = new CodexAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('codex');
         expect(adapter.configDir).toBe('.codex');
      });

      it('detects when .codex directory exists', async () => {
         await mkdir(join(testDir, '.codex'), { recursive: true });
         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('does not detect when .codex directory is missing', async () => {
         expect(await adapter.detect(testDir)).toBe(false);
      });

      it('writes all rules to a single AGENTS.md file', async () => {
         const config = createConfig({
            rules: {
               'rule-one': { activation: 'always', content: 'First rule content' },
               'rule-two': { activation: 'always', content: 'Second rule content' },
            },
         });

         await installToEditor('codex', config, testDir);

         const agentsContent = await readFile(join(testDir, '.codex/AGENTS.md'), 'utf-8');

         expect(agentsContent).toContain('# AGENTS.md');
         expect(agentsContent).toContain('## rule-one');
         expect(agentsContent).toContain('First rule content');
         expect(agentsContent).toContain('## rule-two');
         expect(agentsContent).toContain('Second rule content');
      });

      // Note: Codex MCP is global-only (~/.codex/config.toml), so project-level MCP is not supported
   });

   describe('Scope filtering', () => {
      it('only installs MCP when scope is mcp', async () => {
         const config = createConfig({
            rules: { 'test-rule': { content: 'Test rule' } },
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         // Use cursor which supports MCP (windsurf MCP is global-only)
         const result = await installToEditor('cursor', config, testDir, { scopes: ['mcp'] });

         expect(result.success).toBe(true);
         // Should have MCP config but no rules
         const mcpChanges = result.changes.filter((c) => c.path.includes('mcp.json'));
         const ruleChanges = result.changes.filter((c) => c.path.includes('rules/'));

         expect(mcpChanges.length).toBeGreaterThan(0);
         expect(ruleChanges.length).toBe(0);
      });

      it('only installs rules when scope is rules', async () => {
         const config = createConfig({
            rules: { 'test-rule': { content: 'Test rule' } },
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         const result = await installToEditor('windsurf', config, testDir, { scopes: ['rules'] });

         expect(result.success).toBe(true);
         const mcpChanges = result.changes.filter((c) => c.path.includes('mcp_config'));
         const ruleChanges = result.changes.filter((c) => c.path.includes('rules/'));

         expect(mcpChanges.length).toBe(0);
         expect(ruleChanges.length).toBeGreaterThan(0);
      });
   });

   describe('Idempotency', () => {
      it('reports unchanged when content is identical', async () => {
         const config = createConfig({
            rules: { 'test-rule': { content: 'Test rule' } },
         });

         // First install
         await installToEditor('windsurf', config, testDir);

         // Second install should report unchanged
         const result = await installToEditor('windsurf', config, testDir);

         expect(result.success).toBe(true);
         const unchangedChanges = result.changes.filter((c) => c.action === 'unchanged');

         expect(unchangedChanges.length).toBeGreaterThan(0);
      });

      it('reports update when content changes', async () => {
         const config1 = createConfig({
            rules: { 'test-rule': { content: 'Original rule' } },
         });

         await installToEditor('windsurf', config1, testDir);

         const config2 = createConfig({
            rules: { 'test-rule': { content: 'Updated rule' } },
         });

         const result = await installToEditor('windsurf', config2, testDir);

         expect(result.success).toBe(true);
         const updateChanges = result.changes.filter((c) => c.action === 'update');

         expect(updateChanges.length).toBeGreaterThan(0);
      });
   });

   describe('JSON merge behavior', () => {
      it('merges MCP servers with existing config by default', async () => {
         // First install with server A
         const config1 = createConfig({
            mcp: {
               serverA: createMcpServer('cmd-a', ['--arg-a']),
            },
         });

         await installToEditor('cursor', config1, testDir);

         // Second install with server B - should merge, not replace
         const config2 = createConfig({
            mcp: {
               serverB: createMcpServer('cmd-b', ['--arg-b']),
            },
         });

         await installToEditor('cursor', config2, testDir);

         // Verify both servers are present
         const mcpContent = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.serverA).toBeDefined();
         expect(mcpConfig.mcpServers.serverB).toBeDefined();
         expect(mcpConfig.mcpServers.serverA.command).toBe('cmd-a');
         expect(mcpConfig.mcpServers.serverB.command).toBe('cmd-b');
      });

      it('replaces entire server object when same server name exists', async () => {
         // First install with server config
         const config1 = createConfig({
            mcp: {
               github: createMcpServer('old-cmd', ['--old-arg']),
            },
         });

         await installToEditor('cursor', config1, testDir);

         // Second install with updated server config
         const config2 = createConfig({
            mcp: {
               github: createMcpServer('new-cmd', ['--new-arg']),
            },
         });

         await installToEditor('cursor', config2, testDir);

         // Verify server was completely replaced (not merged)
         const mcpContent = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.github.command).toBe('new-cmd');
         expect(mcpConfig.mcpServers.github.args).toEqual(['--new-arg']);
      });

      it('overwrites entire file with --overwrite flag', async () => {
         // First install with server A
         const config1 = createConfig({
            mcp: {
               serverA: createMcpServer('cmd-a'),
            },
         });

         await installToEditor('cursor', config1, testDir);

         // Verify server A was written
         const mcpContentBefore = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfigBefore = JSON.parse(mcpContentBefore);

         expect(mcpConfigBefore.mcpServers.serverA).toBeDefined();

         // Second install with server B and overwrite flag
         const config2 = createConfig({
            mcp: {
               serverB: createMcpServer('cmd-b'),
            },
         });

         await installToEditor('cursor', config2, testDir, { overwrite: true });

         // Verify only server B is present (server A was removed)
         const mcpContent = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.serverA).toBeUndefined();
         expect(mcpConfig.mcpServers.serverB).toBeDefined();
      });

      it('preserves user-added keys in MCP config', async () => {
         // Manually create an MCP config with user-added content
         const userConfig = {
            mcpServers: {
               userServer: { command: 'user-cmd', args: [] },
            },
            customUserKey: 'should be preserved',
         };

         await mkdir(join(testDir, '.cursor'), { recursive: true });
         await writeFile(
            join(testDir, '.cursor/mcp.json'),
            JSON.stringify(userConfig, null, 2) + '\n',
            'utf-8',
         );

         // Install with aix
         const config = createConfig({
            mcp: {
               aixServer: createMcpServer('aix-cmd'),
            },
         });

         await installToEditor('cursor', config, testDir);

         // Verify user content is preserved
         const mcpContent = await readFile(join(testDir, '.cursor/mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.userServer).toBeDefined();
         expect(mcpConfig.mcpServers.aixServer).toBeDefined();
         expect(mcpConfig.customUserKey).toBe('should be preserved');
      });

      it('does not merge markdown rule files', async () => {
         // First install with rule content
         const config1 = createConfig({
            rules: { 'my-rule': { activation: 'always', content: 'Original content' } },
         });

         await installToEditor('windsurf', config1, testDir);

         // Second install with different content - should overwrite, not merge
         const config2 = createConfig({
            rules: { 'my-rule': { activation: 'always', content: 'New content' } },
         });

         await installToEditor('windsurf', config2, testDir);

         // Verify content was replaced
         const ruleContent = await readFile(join(testDir, '.windsurf/rules/my-rule.md'), 'utf-8');

         expect(ruleContent).toContain('New content');
         expect(ruleContent).not.toContain('Original content');
      });

      it('dry-run shows accurate merged content', async () => {
         // First install with server A
         const config1 = createConfig({
            mcp: {
               serverA: createMcpServer('cmd-a'),
            },
         });

         await installToEditor('cursor', config1, testDir);

         // Dry-run with server B
         const config2 = createConfig({
            mcp: {
               serverB: createMcpServer('cmd-b'),
            },
         });
         const result = await installToEditor('cursor', config2, testDir, { dryRun: true });

         // Verify dry-run shows merged content
         const mcpChange = result.changes.find((c) => c.path.includes('mcp.json'));

         expect(mcpChange).toBeDefined();
         const previewContent = JSON.parse(mcpChange!.content!);

         expect(previewContent.mcpServers.serverA).toBeDefined();
         expect(previewContent.mcpServers.serverB).toBeDefined();
      });
   });

   describe('Unsupported feature detection', () => {
      it('VS Code reports unsupported hooks but not MCP', async () => {
         const config = createConfig({
            mcp: {
               server1: createMcpServer('cmd1'),
               server2: createMcpServer('cmd2'),
            },
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         const result = await installToEditor('vscode', config, testDir);

         // VS Code now supports MCP but not hooks
         expect(result.unsupportedFeatures?.mcp).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks).toBeDefined();
         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBe(true);
      });

      it('Zed reports unsupported hooks but not MCP', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         const result = await installToEditor('zed', config, testDir);

         expect(result.unsupportedFeatures?.mcp).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks).toBeDefined();
         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBe(true);
      });

      it('Codex reports unsupported hooks', async () => {
         const config = createConfig({
            hooks: {
               session_end: [{ hooks: [{ command: 'echo end' }] }],
            },
         });

         const result = await installToEditor('codex', config, testDir);

         expect(result.unsupportedFeatures?.hooks).toBeDefined();
         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBe(true);
      });

      it('Claude Code reports no unsupported features for standard config', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
            hooks: {
               session_start: [{ hooks: [{ command: 'echo start' }] }],
            },
         });

         const result = await installToEditor('claude-code', config, testDir);

         // Claude Code supports both MCP and hooks
         expect(result.unsupportedFeatures?.mcp).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks).toBeUndefined();
      });

      it('Windsurf MCP is global-only (not unsupported), hooks are supported', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         const result = await installToEditor('windsurf', config, testDir, { skipGlobal: true });

         // Windsurf MCP is global-only, so it's handled via globalChanges, not unsupportedFeatures
         // With skipGlobal: true, global MCP is skipped but not reported as "unsupported"
         expect(result.unsupportedFeatures?.mcp).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks).toBeUndefined();
         // Global changes should be present (skipped due to skipGlobal option)
         expect(result.globalChanges).toBeDefined();
         expect(result.globalChanges?.skipped.length).toBeGreaterThan(0);
      });

      it('returns empty unsupportedFeatures when config has no features', async () => {
         const config = createConfig({});

         const result = await installToEditor('vscode', config, testDir);

         // No features configured, so nothing to report as unsupported
         expect(result.unsupportedFeatures).toBeUndefined();
      });
   });
});
