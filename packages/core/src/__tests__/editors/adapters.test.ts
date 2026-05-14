import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { homedir, tmpdir } from 'node:os';
import type { AiJsonConfig, McpServerConfig } from '@a1st/aix-schema';
import {
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   CopilotAdapter,
   ZedAdapter,
   CodexAdapter,
   GeminiAdapter,
   OpenCodeAdapter,
   getAdapter,
   getAvailableEditors,
   detectEditors,
   installToEditor,
} from '../../editors/index.js';
import { extractGlobDirectoryPrefix } from '../../editors/adapters/codex.js';
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
   let originalHome: string | undefined;

   beforeEach(async () => {
      originalHome = process.env.HOME;
      testDir = join(
         tmpdir(),
         `aix-editor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      if (originalHome === undefined) {
         delete process.env.HOME;
      } else {
         process.env.HOME = originalHome;
      }
      await safeRm(testDir, { force: true });
   });

   describe('getAvailableEditors', () => {
      it('returns all supported editors', () => {
         const editors = getAvailableEditors();

         expect(editors).toContain('windsurf');
         expect(editors).toContain('cursor');
         expect(editors).toContain('claude-code');
         expect(editors).toContain('copilot');
         expect(editors).toContain('zed');
         expect(editors).toContain('codex');
         expect(editors).toContain('gemini');
         expect(editors).toContain('opencode');
         expect(editors).toHaveLength(8);
      });
   });

   describe('getAdapter', () => {
      it('returns correct adapter for each editor', () => {
         expect(getAdapter('windsurf')).toBeInstanceOf(WindsurfAdapter);
         expect(getAdapter('cursor')).toBeInstanceOf(CursorAdapter);
         expect(getAdapter('claude-code')).toBeInstanceOf(ClaudeCodeAdapter);
         expect(getAdapter('copilot')).toBeInstanceOf(CopilotAdapter);
         expect(getAdapter('zed')).toBeInstanceOf(ZedAdapter);
         expect(getAdapter('codex')).toBeInstanceOf(CodexAdapter);
         expect(getAdapter('gemini')).toBeInstanceOf(GeminiAdapter);
         expect(getAdapter('opencode')).toBeInstanceOf(OpenCodeAdapter);
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

         expect(ruleContent).toContain('trigger: always_on');
         expect(ruleContent).toContain('Rule content here');
      });

      it('quotes YAML-sensitive rule metadata', async () => {
         const config = createConfig({
            rules: {
               'glob-rule': {
                  activation: 'glob',
                  globs: ['*.ts', '*.tsx'],
                  content: 'Glob rule content',
               },
            },
         });

         await installToEditor('windsurf', config, testDir);

         const ruleContent = await readFile(join(testDir, '.windsurf/rules/glob-rule.md'), 'utf-8');

         expect(ruleContent).toContain('trigger: glob');
         expect(ruleContent).toContain('globs: "*.ts, *.tsx"');
         expect(ruleContent).toContain('Glob rule content');
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
         await expect(
            readFile(join(testDir, '.windsurf/rules/rule.md'), 'utf-8'),
         ).rejects.toThrow();
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
                  activation: 'glob',
                  description: 'Auto: applied rule',
                  globs: ['*.ts', '*.tsx'],
                  content: 'Rule content',
               },
            },
         });

         await installToEditor('cursor', config, testDir);

         const ruleContent = await readFile(
            join(testDir, '.cursor/rules/cursor-rule.mdc'),
            'utf-8',
         );

         expect(ruleContent).toContain('---');
         expect(ruleContent).toContain('alwaysApply: false');
         expect(ruleContent).toContain('description: "Auto: applied rule"');
         expect(ruleContent).toContain('globs: "*.ts, *.tsx"');
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
                  description: 'TypeScript: files',
                  globs: ['src/**/*.ts', 'lib/**/*.ts'],
                  content: 'TypeScript rule',
               },
            },
         });

         await installToEditor('claude-code', config, testDir);

         const ruleContent = await readFile(join(testDir, '.claude/rules/claude-rule.md'), 'utf-8');

         expect(ruleContent).toContain('description: "TypeScript: files"');
         expect(ruleContent).toContain('paths:');
         expect(ruleContent).toContain('  - "src/**/*.ts"');
         expect(ruleContent).toContain('  - "lib/**/*.ts"');
         expect(ruleContent).toContain('TypeScript rule');
      });

      it('writes MCP config to project root, not .claude/', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         const result = await installToEditor('claude-code', config, testDir);

         const mcpChange = result.changes.find((c) => c.category === 'mcp');

         expect(mcpChange).toBeDefined();
         expect(mcpChange!.path).toBe(join(testDir, '.mcp.json'));

         const mcpContent = await readFile(join(testDir, '.mcp.json'), 'utf-8'),
               mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.server).toBeDefined();
      });
   });

   describe('CopilotAdapter', () => {
      const adapter = new CopilotAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('copilot');
         // configDir stays .vscode so rules/prompts/hooks keep their .github-relative paths.
         expect(adapter.configDir).toBe('.vscode');
      });

      it('detects when a project-level .mcp.json file exists', async () => {
         await writeFile(join(testDir, '.mcp.json'), '{}\n', 'utf-8');

         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('writes rules to .github/instructions/', async () => {
         const config = createConfig({
            rules: { 'copilot-rule': { content: 'GitHub Copilot rule' } },
         });

         await installToEditor('copilot', config, testDir);

         const ruleContent = await readFile(
            join(testDir, '.github/instructions/copilot-rule.instructions.md'),
            'utf-8',
         );

         expect(ruleContent).toContain('GitHub Copilot rule');
      });

      it('writes MCP config to project-root .mcp.json', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd', ['--arg']),
            },
         });

         await installToEditor('copilot', config, testDir);

         const mcpContent = await readFile(join(testDir, '.mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.server).toBeDefined();
         expect(mcpConfig.mcpServers.server.type).toBe('local');
         expect(mcpConfig.mcpServers.server.command).toBe('cmd');
         expect(mcpConfig.mcpServers.server.args).toEqual(['--arg']);
      });

      it('merges existing flat .mcp.json content into aix-managed mcpServers', async () => {
         await writeFile(
            join(testDir, '.mcp.json'),
            JSON.stringify({
               existing: {
                  command: 'user-cmd',
                  args: ['--user'],
               },
               customUserKey: 'keep-me',
            }, null, 2) + '\n',
            'utf-8',
         );

         const config = createConfig({
            mcp: {
               aixServer: createMcpServer('aix-cmd'),
            },
         });

         await installToEditor('copilot', config, testDir);

         const mcpContent = await readFile(join(testDir, '.mcp.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.existing).toBeDefined();
         expect(mcpConfig.mcpServers.aixServer).toBeDefined();
         expect(mcpConfig.customUserKey).toBe('keep-me');
      });

      it('uses user-level Copilot MCP path when targetScope is user', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         const result = await installToEditor('copilot', config, testDir, {
            dryRun: true,
            scopes: ['mcp'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.config/github-copilot/mcp-config.json'));
      });

      it('writes hooks to .github/hooks/hooks.json', async () => {
         const config = createConfig({
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         await installToEditor('copilot', config, testDir);

         const hooksContent = await readFile(join(testDir, '.github/hooks/hooks.json'), 'utf-8'),
               hooksConfig = JSON.parse(hooksContent);

         expect(hooksConfig.version).toBe(1);
         expect(hooksConfig.hooks.preToolUse).toEqual([{
            matcher: 'bash|powershell',
            hooks: [{
               type: 'command',
               bash: 'echo pre',
            }],
         }]);
      });

      it('uses user-level Copilot hooks path when targetScope is user', async () => {
         const config = createConfig({
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         const result = await installToEditor('copilot', config, testDir, {
            dryRun: true,
            scopes: ['editors'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.config/github-copilot/hooks/hooks.json'));
      });

      it('keeps project-scope prompts as native Copilot prompt files', async () => {
         const config = createConfig({
            prompts: {
               review: {
                  description: 'Review the current change.',
                  argumentHint: '[diff]',
                  content: 'Review this diff.',
               },
            },
         });

         await installToEditor('copilot', config, testDir);

         const promptContent = await readFile(join(testDir, '.github/prompts/review.prompt.md'), 'utf-8');

         expect(promptContent).toContain('name: "review"');
         expect(promptContent).toContain('description: "Review the current change."');
         expect(promptContent).toContain('argument-hint: "[diff]"');
         expect(promptContent).toContain('Review this diff.');
         expect(existsSync(join(testDir, '.aix/skills/review/SKILL.md'))).toBe(false);
      });

      it('converts user-scope prompts into Copilot skills', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         const config = createConfig({
            prompts: {
               review: {
                  description: 'Review the current change.',
                  argumentHint: '[diff]',
                  content: 'Review this diff.',
               },
            },
         });

         const result = await installToEditor('copilot', config, testDir, { targetScope: 'user' });

         expect(result.success).toBe(true);
         expect(existsSync(join(fakeHome, '.aix/skills/review/SKILL.md'))).toBe(true);
         expect(existsSync(join(fakeHome, '.config/github-copilot/skills/review'))).toBe(true);
         expect(existsSync(join(fakeHome, 'Library/Application Support/Code/User/prompts/review.prompt.md'))).toBe(false);

         const skillContent = await readFile(join(fakeHome, '.aix/skills/review/SKILL.md'), 'utf-8');

         expect(skillContent).toContain('name: review');
         expect(skillContent).toContain('Argument hint from the original prompt: `[diff]`');
         expect(skillContent).toContain('Review this diff.');
      });

      it('renames user-scope prompt skills when they conflict with Copilot skills', async () => {
         const skillDir = join(testDir, 'skills', 'review'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: review
description: Review code as a skill.
---

Skill instructions.
`,
         );

         const config = createConfig({
            skills: {
               review: './skills/review',
            },
            prompts: {
               review: {
                  description: 'Review code as a prompt.',
                  content: 'Prompt instructions.',
               },
            },
         });

         const result = await installToEditor('copilot', config, testDir, { targetScope: 'user' });

         expect(result.success).toBe(true);
         expect(existsSync(join(fakeHome, '.aix/skills/review/SKILL.md'))).toBe(true);
         expect(existsSync(join(fakeHome, '.aix/skills/prompt-review/SKILL.md'))).toBe(true);
         expect(existsSync(join(fakeHome, '.config/github-copilot/skills/review'))).toBe(true);
         expect(existsSync(join(fakeHome, '.config/github-copilot/skills/prompt-review'))).toBe(true);
         expect(existsSync(join(fakeHome, 'Library/Application Support/Code/User/prompts/review.prompt.md'))).toBe(false);

         const promptSkillContent = await readFile(
            join(fakeHome, '.aix/skills/prompt-review/SKILL.md'),
            'utf-8',
         );

         expect(promptSkillContent).toContain('name: prompt-review');
         expect(promptSkillContent).toContain('Original prompt name: `review`.');
         expect(promptSkillContent).toContain('Prompt instructions.');
      });

      it('uses user-level Copilot skills path when targetScope is user', async () => {
         const skillDir = join(testDir, 'skills', 'demo-skill'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: demo-skill
description: Demo skill
---
`,
         );

         const result = await installToEditor(
            'copilot',
            createConfig({
               skills: {
                  'demo-skill': './skills/demo-skill',
               },
            }),
            testDir,
            { dryRun: true, scopes: ['skills'], targetScope: 'user' },
         );

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(fakeHome, '.config/github-copilot/skills', 'demo-skill'));
         expect(result.changes.map((c) => c.path)).toContain(join(fakeHome, '.aix/skills', 'demo-skill'));
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

      it('writes pointer rules during skills-only installs', async () => {
         const skillDir = join(testDir, 'skills', 'demo-skill');

         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: demo-skill
description: Demo skill
---
`,
         );

         await installToEditor(
            'zed',
            createConfig({
               skills: {
                  'demo-skill': './skills/demo-skill',
               },
            }),
            testDir,
            { scopes: ['skills'] },
         );

         expect(existsSync(join(testDir, '.aix', 'skills', 'demo-skill', 'SKILL.md'))).toBe(true);
         await expect(readFile(join(testDir, '.rules'), 'utf-8')).resolves.toContain(
            '.aix/skills/demo-skill/SKILL.md',
         );
      });

      it('writes user-scoped pointer rules to the user-managed .aix path', async () => {
         const skillDir = join(testDir, 'skills', 'demo-skill'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: demo-skill
description: Demo skill
---
`,
         );

         await installToEditor(
            'zed',
            createConfig({
               skills: {
                  'demo-skill': './skills/demo-skill',
               },
            }),
            testDir,
            { scopes: ['skills'], targetScope: 'user' },
         );

         expect(existsSync(join(fakeHome, '.aix', 'skills', 'demo-skill', 'SKILL.md'))).toBe(true);
         expect(existsSync(join(testDir, '.aix', 'skills', 'demo-skill'))).toBe(false);
         await expect(readFile(join(testDir, '.rules'), 'utf-8')).resolves.toContain(
            join(fakeHome, '.aix', 'skills', 'demo-skill', 'SKILL.md'),
         );
      });

      it('reports user-scope pointer-skill limitations in strict mode', async () => {
         const skillDir = join(testDir, 'skills', 'demo-skill'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: demo-skill
description: Demo skill
---
`,
         );

         const result = await installToEditor(
            'zed',
            createConfig({
               skills: {
                  'demo-skill': './skills/demo-skill',
               },
            }),
            testDir,
            { dryRun: true, scopes: ['skills'], targetScope: 'user', strictTargetScope: true },
         );

         expect(result.success).toBe(true);
         expect(result.targetScopeLimitations?.skills?.skills).toEqual(['demo-skill']);
         expect(result.changes).toEqual([]);
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

      it('writes always-activation rules to AGENTS.md at project root', async () => {
         const config = createConfig({
            rules: {
               'rule-one': { activation: 'always', content: 'First rule content' },
               'rule-two': { activation: 'always', content: 'Second rule content' },
            },
         });

         await installToEditor('codex', config, testDir);

         const agentsContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(agentsContent).toContain('<!-- BEGIN AIX MANAGED SECTION');
         expect(agentsContent).toContain('## rule-one');
         expect(agentsContent).toContain('First rule content');
         expect(agentsContent).toContain('## rule-two');
         expect(agentsContent).toContain('Second rule content');
      });

      it('places glob-scoped rules in subdirectory AGENTS.md files', async () => {
         const config = createConfig({
            rules: {
               'root-rule': { activation: 'always', content: 'Root content' },
               'src-rule': {
                  activation: 'glob',
                  globs: ['src/utils/**/*.ts'],
                  content: 'Src utils content',
               },
            },
         });

         await installToEditor('codex', config, testDir);

         // Root rule goes to project-root AGENTS.md
         const rootContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(rootContent).toContain('## root-rule');
         expect(rootContent).toContain('Root content');
         expect(rootContent).not.toContain('Src utils content');

         // Glob rule goes to subdirectory AGENTS.md
         const subContent = await readFile(join(testDir, 'src/utils/AGENTS.md'), 'utf-8');

         expect(subContent).toContain('## src-rule');
         expect(subContent).toContain('Src utils content');
      });

      it('keeps glob rules without a clear directory prefix in root AGENTS.md', async () => {
         const config = createConfig({
            rules: {
               'broad-glob': {
                  activation: 'glob',
                  globs: ['**/*.test.ts'],
                  content: 'Test file rule',
               },
            },
         });

         await installToEditor('codex', config, testDir);

         const rootContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(rootContent).toContain('## broad-glob');
         expect(rootContent).toContain('Test file rule');
      });

      it('removes legacy .codex/AGENTS.md on install', async () => {
         // Create legcy file
         await mkdir(join(testDir, '.codex'), { recursive: true });
         await writeFile(join(testDir, '.codex/AGENTS.md'), '# old content');

         const config = createConfig({
            rules: {
               'new-rule': { activation: 'always', content: 'New content' },
            },
         });

         await installToEditor('codex', config, testDir);

         // Legacy file should be removed
         expect(existsSync(join(testDir, '.codex/AGENTS.md'))).toBe(false);
         // New file at project root
         const rootContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(rootContent).toContain('New content');
      });

      // Note: Codex MCP is global-only (~/.codex/config.toml), so project-level MCP is not supported

      it('preserves existing user content in AGENTS.md', async () => {
         // Create a pre-existing AGENTS.md with user content
         await writeFile(join(testDir, 'AGENTS.md'), '# My Project\n\nCustom instructions here.\n');

         const config = createConfig({
            rules: {
               'managed-rule': { activation: 'always', content: 'Managed content' },
            },
         });

         await installToEditor('codex', config, testDir);

         const agentsContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         // User content is preserved
         expect(agentsContent).toContain('# My Project');
         expect(agentsContent).toContain('Custom instructions here.');
         // Managed content is present
         expect(agentsContent).toContain('## managed-rule');
         expect(agentsContent).toContain('Managed content');
         // Section markers are present
         expect(agentsContent).toContain('<!-- BEGIN AIX MANAGED SECTION');
         expect(agentsContent).toContain('<!-- END AIX MANAGED SECTION -->');
      });

      it('converts prompts to Codex skills', async () => {
         const config = createConfig({
            prompts: {
               review: {
                  description: 'Review the current change.',
                  content: 'Review this change.',
               },
            },
         });

         const result = await installToEditor('codex', config, testDir);

         expect(result.unsupportedFeatures?.prompts).toBeUndefined();
         expect(existsSync(join(testDir, '.aix/skills/review/SKILL.md'))).toBe(true);
         expect(existsSync(join(testDir, '.agents/skills/review'))).toBe(true);

         const skillContent = await readFile(join(testDir, '.aix/skills/review/SKILL.md'), 'utf-8');

         expect(skillContent).toContain('name: review');
         expect(skillContent).toContain('description: "Review the current change."');
         expect(skillContent).toContain('Review this change.');
      });

      it('renames converted prompts when they conflict with configured skills', async () => {
         const skillDir = join(testDir, 'skills', 'review');

         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: review
description: Review code as a skill.
---

Skill instructions.
`,
         );

         const config = createConfig({
            skills: {
               review: './skills/review',
            },
            prompts: {
               review: {
                  description: 'Review code as a prompt.',
                  content: 'Prompt instructions.',
               },
            },
         });

         const result = await installToEditor('codex', config, testDir);

         expect(result.unsupportedFeatures?.prompts).toBeUndefined();
         expect(existsSync(join(testDir, '.aix/skills/review/SKILL.md'))).toBe(true);
         expect(existsSync(join(testDir, '.aix/skills/prompt-review/SKILL.md'))).toBe(true);
         expect(existsSync(join(testDir, '.agents/skills/review'))).toBe(true);
         expect(existsSync(join(testDir, '.agents/skills/prompt-review'))).toBe(true);

         const promptSkillContent = await readFile(
            join(testDir, '.aix/skills/prompt-review/SKILL.md'),
            'utf-8',
         );

         expect(promptSkillContent).toContain('name: prompt-review');
         expect(promptSkillContent).toContain('Original prompt name: `review`.');
         expect(promptSkillContent).toContain('Prompt instructions.');
      });
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

      it('installs prompts when scope is prompts', async () => {
         const config = createConfig({
            prompts: {
               review: { content: 'Review this change.' },
            },
         });

         const result = await installToEditor('claude-code', config, testDir, {
            dryRun: true,
            scopes: ['prompts'],
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(
            join(testDir, '.claude/commands/review.md'),
         );
      });

      it('uses user-level prompt paths when targetScope is user', async () => {
         const config = createConfig({
            prompts: {
               review: { content: 'Review this change.' },
            },
         });

         const result = await installToEditor('claude-code', config, testDir, {
            dryRun: true,
            scopes: ['prompts'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(
            join(homedir(), '.claude/commands/review.md'),
         );
      });

      it('installs agents when scope is agents', async () => {
         const config = createConfig({
            agents: {
               'code-reviewer': {
                  description: 'Review code changes.',
                  mode: 'subagent',
                  model: 'sonnet',
                  tools: ['Read', 'Grep'],
                  permissions: {
                     edit: 'deny',
                  },
                  content: 'Review the current diff.',
               },
            },
            prompts: {
               review: { content: 'Review this change.' },
            },
         });

         const result = await installToEditor('claude-code', config, testDir, {
            dryRun: true,
            scopes: ['agents'],
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(
            join(testDir, '.claude/agents/code-reviewer.md'),
         );
         expect(result.changes.map((c) => c.path)).not.toContain(
            join(testDir, '.claude/commands/review.md'),
         );
         expect(result.changes[0]?.content).toContain('model: "sonnet"');
         expect(result.changes[0]?.content).toContain('edit');
      });

      it('uses user-level MCP paths when targetScope is user', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         const result = await installToEditor('cursor', config, testDir, {
            dryRun: true,
            scopes: ['mcp'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.cursor/mcp.json'));
      });

      it('uses Claude Code user-level MCP path when targetScope is user', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         const result = await installToEditor('claude-code', config, testDir, {
            dryRun: true,
            scopes: ['mcp'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.claude.json'));
      });

      it('uses user-level hooks paths when targetScope is user', async () => {
         const config = createConfig({
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
            },
         });

         const result = await installToEditor('cursor', config, testDir, {
            dryRun: true,
            scopes: ['editors'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.cursor/hooks.json'));
         expect(result.targetScopeLimitations?.hooks).toBeUndefined();
      });

      it('uses user-level Codex rules path when targetScope is user', async () => {
         const config = createConfig({
            rules: { global: { content: 'Use project conventions.' } },
         });

         const result = await installToEditor('codex', config, testDir, {
            dryRun: true,
            scopes: ['rules'],
            targetScope: 'user',
         });

         expect(result.success).toBe(true);
         expect(result.changes.map((c) => c.path)).toContain(join(homedir(), '.codex/AGENTS.md'));
      });

      it('reports user-scope rule limitations instead of silently writing project rules in strict mode', async () => {
         const config = createConfig({
            rules: {
               'cursor-rule': { content: 'Keep this as a user rule.' },
            },
         });

         const result = await installToEditor('cursor', config, testDir, {
            dryRun: true,
            targetScope: 'user',
            strictTargetScope: true,
         });

         expect(result.success).toBe(true);
         expect(result.targetScopeLimitations?.rules?.rules).toEqual(['cursor-rule']);
         expect(result.changes.map((c) => c.path)).not.toContain(join(testDir, '.cursor/rules/cursor-rule.mdc'));
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
      it('GitHub Copilot reports unsupported hooks events but supports hooks overall', async () => {
         const config = createConfig({
            mcp: {
               server1: createMcpServer('cmd1'),
               server2: createMcpServer('cmd2'),
            },
            hooks: {
               pre_command: [{ hooks: [{ command: 'echo pre' }] }],
               task_created: [{ hooks: [{ command: 'echo task' }] }],
            },
         });

         const result = await installToEditor('copilot', config, testDir);

         // GitHub Copilot supports MCP and hooks (but not task_created)
         expect(result.unsupportedFeatures?.mcp).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBeUndefined();
         expect(result.unsupportedFeatures?.hooks?.unsupportedEvents).toContain('task_created');
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

      it('Codex reports unsupported agents', async () => {
         const config = createConfig({
            agents: {
               'code-reviewer': {
                  content: 'Review this change.',
               },
            },
         });

         const result = await installToEditor('codex', config, testDir, { dryRun: true });

         expect(result.unsupportedFeatures?.agents?.agents).toContain('code-reviewer');
      });

      it('Codex does not report prompts as unsupported because they convert to skills', async () => {
         const config = createConfig({
            prompts: {
               review: { content: 'Review this change.' },
            },
         });

         const result = await installToEditor('codex', config, testDir, { dryRun: true });

         expect(result.globalChanges).toBeUndefined();
         expect(result.unsupportedFeatures?.prompts).toBeUndefined();
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

      it('skips global-only MCP when strict project scope is requested', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         process.env.HOME = join(testDir, 'fake-home');

         const result = await installToEditor('windsurf', config, testDir, {
            dryRun: true,
            targetScope: 'project',
            strictTargetScope: true,
         });

         expect(result.success).toBe(true);
         expect(result.globalChanges?.applied).toEqual([]);
         expect(result.globalChanges?.skipped).toEqual([{
            type: 'mcp',
            name: 'server',
            reason: 'Requested target scope is project, so aix did not write global-only config',
         }]);
      });

      it('returns empty unsupportedFeatures when config has no features', async () => {
         const config = createConfig({});

         const result = await installToEditor('copilot', config, testDir);

         // No features configured, so nothing to report as unsupported
         expect(result.unsupportedFeatures).toBeUndefined();
      });
   });

   describe('GeminiAdapter', () => {
      const adapter = new GeminiAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('gemini');
         expect(adapter.configDir).toBe('.gemini');
      });

      it('detects when .gemini directory exists', async () => {
         await mkdir(join(testDir, '.gemini'), { recursive: true });
         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('does not detect when .gemini directory is missing', async () => {
         expect(await adapter.detect(testDir)).toBe(false);
      });

      it('writes rules to GEMINI.md with section markers', async () => {
         const config = createConfig({
            rules: {
               'gemini-rule': { activation: 'always', content: 'Gemini rule content' },
            },
         });

         await installToEditor('gemini', config, testDir);

         const geminiContent = await readFile(join(testDir, 'GEMINI.md'), 'utf-8');

         expect(geminiContent).toContain('<!-- BEGIN AIX MANAGED SECTION');
         expect(geminiContent).toContain('## gemini-rule');
         expect(geminiContent).toContain('Gemini rule content');
         expect(geminiContent).toContain('<!-- END AIX MANAGED SECTION -->');
      });

      it('preserves existing GEMINI.md user content on install', async () => {
         // Create a pre-existing GEMINI.md with user content
         await writeFile(join(testDir, 'GEMINI.md'), '# GEMINI.md\n\nProject conventions here.\n');

         const config = createConfig({
            rules: {
               'managed-rule': { activation: 'always', content: 'Managed content' },
            },
         });

         await installToEditor('gemini', config, testDir);

         const geminiContent = await readFile(join(testDir, 'GEMINI.md'), 'utf-8');

         // User content is preserved
         expect(geminiContent).toContain('# GEMINI.md');
         expect(geminiContent).toContain('Project conventions here.');
         // Managed content is present
         expect(geminiContent).toContain('## managed-rule');
         expect(geminiContent).toContain('Managed content');
      });

      it('writes MCP config to .gemini/settings.json', async () => {
         const config = createConfig({
            mcp: {
               server: createMcpServer('cmd', ['--arg']),
            },
         });

         await installToEditor('gemini', config, testDir);

         const mcpContent = await readFile(join(testDir, '.gemini/settings.json'), 'utf-8');
         const mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.mcpServers.server).toBeDefined();
         expect(mcpConfig.mcpServers.server.command).toBe('cmd');
         expect(mcpConfig.mcpServers.server.args).toEqual(['--arg']);
      });

      it('writes prompts as TOML to .gemini/commands/', async () => {
         const config = createConfig({
            prompts: {
               review: {
                  description: 'Review code',
                  content: 'Please review this code.',
               },
            },
         });

         await installToEditor('gemini', config, testDir);

         const promptContent = await readFile(
            join(testDir, '.gemini/commands/review.toml'),
            'utf-8',
         );

         expect(promptContent).toContain('description = "Review code"');
         expect(promptContent).toContain('prompt = "Please review this code."');
      });

      it('writes hooks into .gemini/settings.json under a hooks key', async () => {
         const config = createConfig({
            hooks: {
               pre_tool_use: [{ matcher: 'read_file', hooks: [{ command: 'check.sh' }] }],
            },
         });

         await installToEditor('gemini', config, testDir);

         const settingsContent = await readFile(join(testDir, '.gemini/settings.json'), 'utf-8'),
               settings = JSON.parse(settingsContent);

         expect(settings.hooks.BeforeTool).toEqual([
            {
               matcher: 'read_file',
               hooks: [{ type: 'command', command: 'check.sh' }],
            },
         ]);
      });

      it('reports unsupported hook events but supports hooks overall', async () => {
         const config = createConfig({
            hooks: {
               // Real Gemini event.
               pre_tool_use: [{ hooks: [{ command: 'one' }] }],
               // aix event Gemini does not translate.
               worktree_setup: [{ hooks: [{ command: 'two' }] }],
            },
         });

         const result = await installToEditor('gemini', config, testDir);

         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBeFalsy();
         expect(result.unsupportedFeatures?.hooks?.unsupportedEvents).toContain('worktree_setup');
      });

      it('merges MCP and hooks into the same .gemini/settings.json without clobber', async () => {
         const config = createConfig({
            mcp: {
               'demo-server': { command: 'demo' },
            },
            hooks: {
               pre_tool_use: [{ hooks: [{ command: 'check.sh' }] }],
            },
         });

         await installToEditor('gemini', config, testDir);

         const settings = JSON.parse(
            await readFile(join(testDir, '.gemini/settings.json'), 'utf-8'),
         );

         expect(settings.mcpServers['demo-server']).toEqual({ command: 'demo' });
         expect(settings.hooks.BeforeTool[0].hooks[0].command).toBe('check.sh');
      });

      it('preserves user-authored keys in .gemini/settings.json across installs', async () => {
         await mkdir(join(testDir, '.gemini'), { recursive: true });
         await writeFile(
            join(testDir, '.gemini/settings.json'),
            JSON.stringify({ theme: 'dark', mcpServers: { existing: { command: 'old' } } }, null, 2),
            'utf-8',
         );

         const config = createConfig({
            mcp: { 'demo-server': { command: 'demo' } },
            hooks: {
               pre_tool_use: [{ hooks: [{ command: 'check.sh' }] }],
            },
         });

         await installToEditor('gemini', config, testDir);

         const settings = JSON.parse(
            await readFile(join(testDir, '.gemini/settings.json'), 'utf-8'),
         );

         expect(settings.theme).toBe('dark');
         expect(settings.mcpServers.existing).toEqual({ command: 'old' });
         expect(settings.mcpServers['demo-server']).toEqual({ command: 'demo' });
         expect(settings.hooks.BeforeTool[0].hooks[0].command).toBe('check.sh');
      });
   });

   describe('OpenCodeAdapter', () => {
      const adapter = new OpenCodeAdapter();

      it('has correct name and configDir', () => {
         expect(adapter.name).toBe('opencode');
         expect(adapter.configDir).toBe('.opencode');
      });

      it('detects when .opencode directory exists', async () => {
         await mkdir(join(testDir, '.opencode'), { recursive: true });

         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('detects when opencode.json exists', async () => {
         await writeFile(join(testDir, 'opencode.json'), '{}');

         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('detects when opencode.jsonc exists', async () => {
         await writeFile(join(testDir, 'opencode.jsonc'), '{}');

         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('does not detect when OpenCode config is missing', async () => {
         expect(await adapter.detect(testDir)).toBe(false);
      });

      it('writes rules to AGENTS.md with section markers', async () => {
         const config = createConfig({
            rules: {
               'opencode-rule': { activation: 'always', content: 'OpenCode rule content' },
            },
         });

         await installToEditor('opencode', config, testDir);

         const agentsContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(agentsContent).toContain('<!-- BEGIN AIX MANAGED SECTION');
         expect(agentsContent).toContain('## opencode-rule');
         expect(agentsContent).toContain('OpenCode rule content');
         expect(agentsContent).toContain('<!-- END AIX MANAGED SECTION -->');
      });

      it('preserves existing AGENTS.md user content on install', async () => {
         await writeFile(join(testDir, 'AGENTS.md'), '# AGENTS.md\n\nProject conventions here.\n');

         const config = createConfig({
            rules: {
               'managed-rule': { activation: 'always', content: 'Managed content' },
            },
         });

         await installToEditor('opencode', config, testDir);

         const agentsContent = await readFile(join(testDir, 'AGENTS.md'), 'utf-8');

         expect(agentsContent).toContain('# AGENTS.md');
         expect(agentsContent).toContain('Project conventions here.');
         expect(agentsContent).toContain('## managed-rule');
         expect(agentsContent).toContain('Managed content');
      });

      it('writes MCP config to opencode.json', async () => {
         const config = createConfig({
            mcp: {
               localServer: {
                  command: 'cmd',
                  args: ['--arg'],
                  env: { TOKEN: '${TOKEN}' },
                  enabled: false,
               },
               remoteServer: {
                  url: 'https://example.com/mcp',
                  headers: { Authorization: 'Bearer ${TOKEN}' },
                  timeout: 6000,
               },
            },
         });

         await installToEditor('opencode', config, testDir);

         const mcpContent = await readFile(join(testDir, 'opencode.json'), 'utf-8'),
               mcpConfig = JSON.parse(mcpContent);

         expect(mcpConfig.$schema).toBe('https://opencode.ai/config.json');
         expect(mcpConfig.mcp.localServer.type).toBe('local');
         expect(mcpConfig.mcp.localServer.command).toEqual(['cmd', '--arg']);
         expect(mcpConfig.mcp.localServer.environment).toEqual({ TOKEN: '${TOKEN}' });
         expect(mcpConfig.mcp.localServer.enabled).toStrictEqual(false);
         expect(mcpConfig.mcp.remoteServer.type).toBe('remote');
         expect(mcpConfig.mcp.remoteServer.url).toBe('https://example.com/mcp');
         expect(mcpConfig.mcp.remoteServer.headers).toEqual({
            Authorization: 'Bearer ${TOKEN}',
         });
         expect(mcpConfig.mcp.remoteServer.timeout).toBe(6000);
      });

      it('writes prompts as markdown commands to .opencode/commands/', async () => {
         const config = createConfig({
            prompts: {
               review: {
                  description: 'Review code',
                  content: 'Please review this code.',
               },
            },
         });

         await installToEditor('opencode', config, testDir);

         const promptContent = await readFile(
            join(testDir, '.opencode/commands/review.md'),
            'utf-8',
         );

         expect(promptContent).toContain('description: "Review code"');
         expect(promptContent).toContain('Please review this code.');
      });

      it('installs skills to .opencode/skills/', async () => {
         const skillDir = join(testDir, 'skills', 'release');

         await mkdir(skillDir, { recursive: true });
         await writeFile(
            join(skillDir, 'SKILL.md'),
            `---
name: release
description: Prepare a release.
---

Release instructions.
`,
         );

         const config = createConfig({
            skills: {
               release: './skills/release',
            },
         });

         await installToEditor('opencode', config, testDir);

         expect(existsSync(join(testDir, '.aix/skills/release/SKILL.md'))).toBe(true);
         expect(existsSync(join(testDir, '.opencode/skills/release'))).toBe(true);
      });

      it('uses user-scope OpenCode paths', async () => {
         process.env.HOME = testDir;

         const config = createConfig({
            rules: {
               'global-rule': { activation: 'always', content: 'Global OpenCode rule' },
            },
            prompts: {
               review: { content: 'Review globally.' },
            },
            mcp: {
               server: createMcpServer('cmd'),
            },
         });

         await installToEditor('opencode', config, testDir, { targetScope: 'user' });

         expect(existsSync(join(testDir, '.config/opencode/AGENTS.md'))).toBe(true);
         expect(existsSync(join(testDir, '.config/opencode/opencode.json'))).toBe(true);
         expect(existsSync(join(testDir, '.config/opencode/commands/review.md'))).toBe(true);
      });

      it('reports unsupported hooks', async () => {
         const config = createConfig({
            hooks: {
               session_end: [{ hooks: [{ command: 'echo end' }] }],
            },
         });

         const result = await installToEditor('opencode', config, testDir);

         expect(result.unsupportedFeatures?.hooks).toBeDefined();
         expect(result.unsupportedFeatures?.hooks?.allUnsupported).toBe(true);
      });
   });
});

describe('extractGlobDirectoryPrefix', () => {
   const rule = (activation: Record<string, unknown>) =>
      ({ content: '', activation }) as Parameters<typeof extractGlobDirectoryPrefix>[0];

   it('returns empty string for always-activation rules', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'always' }))).toBe('');
   });

   it('returns empty string for auto-activation rules', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'auto', description: 'test' }))).toBe('');
   });

   it('returns empty string for glob rules without globs', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'glob', globs: [] }))).toBe('');
   });

   it('extracts static prefix from a single glob', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'glob', globs: ['src/utils/**/*.ts'] }))).toBe(
         'src/utils',
      );
   });

   it('extracts shared prefix from multiple globs in the same directory', () => {
      expect(
         extractGlobDirectoryPrefix(
            rule({ type: 'glob', globs: ['src/utils/**/*.ts', 'src/utils/**/*.js'] }),
         ),
      ).toBe('src/utils');
   });

   it('returns empty string when globs have different prefixes', () => {
      expect(
         extractGlobDirectoryPrefix(rule({ type: 'glob', globs: ['src/**/*.ts', 'lib/**/*.ts'] })),
      ).toBe('');
   });

   it('returns empty string for root-level wildcards', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'glob', globs: ['**/*.test.ts'] }))).toBe('');
   });

   it('returns empty string for single-segment wildcard', () => {
      expect(extractGlobDirectoryPrefix(rule({ type: 'glob', globs: ['*.ts'] }))).toBe('');
   });

   it('handles deeply nested prefix', () => {
      expect(
         extractGlobDirectoryPrefix(rule({ type: 'glob', globs: ['packages/core/src/**'] })),
      ).toBe('packages/core/src');
   });
});
