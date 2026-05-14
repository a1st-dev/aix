import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import {
   importFromEditor,
   getGlobalConfigPath,
   buildConfigFromEditorImport,
   type ImportResult,
} from '../../editors/import.js';

describe('Editor Config Import', () => {
   describe('getGlobalConfigPath', () => {
      it('returns global path for windsurf', () => {
         const path = getGlobalConfigPath('windsurf');

         // Windsurf MCP is global-only, returns the global config path
         expect(path).toContain('windsurf');
      });

      it('returns path for cursor', () => {
         const path = getGlobalConfigPath('cursor');

         expect(path).toContain('cursor');
      });

      it('returns path for claude-code', () => {
         const path = getGlobalConfigPath('claude-code');

         expect(path).toContain('.claude.json');
         expect(path).not.toContain('claude_desktop_config.json');
      });

      it('returns path for copilot', () => {
         const path = getGlobalConfigPath('copilot');

         expect(path).toContain('.config/github-copilot');
         expect(path).toContain('mcp-config.json');
      });

      it('returns path for zed', () => {
         const path = getGlobalConfigPath('zed');

         expect(path).toMatch(/[Zz]ed/);
      });

      it('returns global path for codex', () => {
         const path = getGlobalConfigPath('codex');

         // Codex MCP is global-only, returns the global config path
         expect(path).toContain('codex');
      });

      it('returns global path for opencode', () => {
         const path = getGlobalConfigPath('opencode');

         expect(path).toContain('opencode');
      });
   });

   describe('importFromEditor', () => {
      it('returns empty result with warning when config not found', async () => {
         // This test will fail to find the config file (unless the editor is installed)
         // and should return warnings
         const result = await importFromEditor('windsurf');

         expect(result).toHaveProperty('mcp');
         expect(result).toHaveProperty('rules');
         expect(result).toHaveProperty('warnings');
         expect(Array.isArray(result.warnings)).toBe(true);
      });

      it('imports MCP from copilot if config exists', async () => {
         const result = await importFromEditor('copilot');

         // GitHub Copilot supports MCP - result depends on whether config file exists
         expect(result).toHaveProperty('mcp');
         expect(typeof result.mcp).toBe('object');
      });

      it('imports Copilot project MCP from .mcp.json', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-copilot-project-mcp-'));

         try {
            await writeFile(
               join(projectRoot, '.mcp.json'),
               JSON.stringify({
                  docs: {
                     command: 'npx',
                     args: ['-y', '@example/docs-mcp'],
                  },
               }, null, 2) + '\n',
               'utf-8',
            );

            const result = await importFromEditor('copilot', { projectRoot });

            expect(result.mcp.docs).toEqual({
               command: 'npx',
               args: ['-y', '@example/docs-mcp'],
            });
            expect(result.paths.mcp.docs).toBe(join(projectRoot, '.mcp.json'));
            expect(result.scopes.mcp.docs).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports Copilot project MCP from .github/mcp.json when .mcp.json is missing', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-copilot-github-mcp-'));

         try {
            await mkdir(join(projectRoot, '.github'), { recursive: true });
            await writeFile(
               join(projectRoot, '.github/mcp.json'),
               JSON.stringify({
                  mcpServers: {
                     github: {
                        type: 'http',
                        url: 'https://example.com/mcp',
                     },
                  },
               }, null, 2) + '\n',
               'utf-8',
            );

            const result = await importFromEditor('copilot', { projectRoot });

            expect(result.mcp.github).toEqual({
               url: 'https://example.com/mcp',
            });
            expect(result.paths.mcp.github).toBe(join(projectRoot, '.github/mcp.json'));
            expect(result.scopes.mcp.github).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports Copilot user MCP from ~/.config/github-copilot/mcp-config.json', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-copilot-user-mcp-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME;

         process.env.HOME = fakeHome;

         try {
            await mkdir(join(fakeHome, '.config/github-copilot'), { recursive: true });
            await writeFile(
               join(fakeHome, '.config/github-copilot', 'mcp-config.json'),
               JSON.stringify({
                  mcpServers: {
                     github: {
                        type: 'local',
                        command: 'npx',
                        args: ['-y', '@modelcontextprotocol/server-github'],
                     },
                  },
               }, null, 2) + '\n',
               'utf-8',
            );

            const result = await importFromEditor('copilot', {
               projectRoot,
               scope: 'user',
            });

            expect(result.mcp.github).toEqual({
               command: 'npx',
               args: ['-y', '@modelcontextprotocol/server-github'],
            });
            expect(result.paths.mcp.github).toBe(join(fakeHome, '.config/github-copilot', 'mcp-config.json'));
            expect(result.scopes.mcp.github).toBe('user');
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports Zed project rules with a display name and path', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-zed-rules-'));

         try {
            const rulesPath = join(projectRoot, '.rules');

            await writeFile(rulesPath, 'Use short names.', 'utf-8');

            const result = await importFromEditor('zed', { projectRoot });

            expect(result.rules).toEqual([{
               name: 'project rules',
               content: 'Use short names.',
               path: rulesPath,
               scope: 'project',
            }]);
            expect(result.paths.rules['project rules']).toBe(rulesPath);
            expect(result.scopes.rules['project rules']).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports project skills from editor skill directories', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-codex-skills-'));

         try {
            const skillPath = join(projectRoot, '.agents', 'skills', 'typescript');

            await mkdir(skillPath, { recursive: true });
            await writeFile(join(skillPath, 'SKILL.md'), '# TypeScript', 'utf-8');

            const result = await importFromEditor('codex', { projectRoot });

            expect(result.skills.typescript).toBe(skillPath);
            expect(result.paths.skills.typescript).toBe(skillPath);
            expect(result.scopes.skills.typescript).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports Claude Code project agents into unified agents', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-claude-agents-'));

         try {
            const agentsDir = join(projectRoot, '.claude', 'agents');

            await mkdir(agentsDir, { recursive: true });
            await writeFile(
               join(agentsDir, 'code-reviewer.md'),
               [
                  '---',
                  'name: "code-reviewer"',
                  'description: "Review code changes."',
                  'model: "sonnet"',
                  'tools:',
                  '  - "Read"',
                  '  - "Grep"',
                  'permissions:',
                  '  edit: deny',
                  '---',
                  '',
                  'Review the current diff.',
                  '',
               ].join('\n'),
               'utf-8',
            );

            const result = await importFromEditor('claude-code', { projectRoot, scope: 'project' }),
                  config = buildConfigFromEditorImport('claude-code', result);

            expect(result.agents['code-reviewer']?.content).toBe('Review the current diff.');
            expect(result.agents['code-reviewer']?.tools).toEqual(['Read', 'Grep']);
            expect(result.paths.agents['code-reviewer']).toBe(join(agentsDir, 'code-reviewer.md'));
            expect(result.scopes.agents['code-reviewer']).toBe('project');
            expect(config.agents?.['code-reviewer']).toMatchObject({
               content: 'Review the current diff.',
               description: 'Review code changes.',
               model: 'sonnet',
               tools: ['Read', 'Grep'],
            });
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports user-scoped Cursor hooks into generic hook events', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-cursor-hooks-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME;

         process.env.HOME = fakeHome;

         try {
            await mkdir(join(fakeHome, '.cursor'), { recursive: true });
            await writeFile(
               join(fakeHome, '.cursor', 'hooks.json'),
               JSON.stringify({
                  hooks: {
                     beforeShellExecution: [{
                        command: 'echo pre',
                        timeout: 10,
                     }],
                     stop: [{
                        command: 'echo stop',
                     }],
                  },
               }),
               'utf-8',
            );

            const result = await importFromEditor('cursor', {
               projectRoot,
               scope: 'user',
            });

            expect(result.hooks.pre_command).toEqual([{
               hooks: [{
                  command: 'echo pre',
                  timeout: 10,
               }],
            }]);
            expect(result.hooks.agent_stop).toEqual([{
               hooks: [{
                  command: 'echo stop',
               }],
            }]);
            expect(result.scopes.hooks.pre_command).toBe('user');
            expect(result.paths.hooks.pre_command).toBe(join(fakeHome, '.cursor', 'hooks.json'));
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports user-scoped Copilot hooks into generic hook events', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-copilot-hooks-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME;

         process.env.HOME = fakeHome;

         try {
            await mkdir(join(fakeHome, '.config/github-copilot', 'hooks'), { recursive: true });
            await writeFile(
               join(fakeHome, '.config/github-copilot', 'hooks', 'hooks.json'),
               JSON.stringify({
                  hooks: {
                     preToolUse: [{
                        matcher: 'bash|powershell',
                        hooks: [{
                           type: 'command',
                           command: 'echo pre',
                           timeout: 15,
                        }],
                     }],
                     agentStop: [{
                        matcher: '',
                        hooks: [{
                           type: 'command',
                           command: 'echo stop',
                        }],
                     }],
                  },
               }),
               'utf-8',
            );

            const result = await importFromEditor('copilot', {
               projectRoot,
               scope: 'user',
            });

            expect(result.hooks.pre_command).toEqual([{
               hooks: [{
                  command: 'echo pre',
                  timeout: 15,
               }],
            }]);
            expect(result.hooks.agent_stop).toEqual([{
               hooks: [{
                  command: 'echo stop',
               }],
            }]);
            expect(result.scopes.hooks.pre_command).toBe('user');
            expect(result.paths.hooks.pre_command).toBe(join(fakeHome, '.config/github-copilot', 'hooks', 'hooks.json'));
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports user-scoped Gemini hooks into generic hook events', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-gemini-hooks-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME;

         process.env.HOME = fakeHome;

         try {
            await mkdir(join(fakeHome, '.gemini'), { recursive: true });
            await writeFile(
               join(fakeHome, '.gemini', 'settings.json'),
               JSON.stringify({
                  hooks: {
                     BeforeTool: [{
                        matcher: 'Shell',
                        sequential: true,
                        hooks: [{
                           type: 'command',
                           command: 'echo pre',
                           timeout: 1000,
                           name: 'audit',
                        }],
                     }],
                  },
               }),
               'utf-8',
            );

            const result = await importFromEditor('gemini', {
               projectRoot,
               scope: 'user',
            });

            expect(result.hooks.pre_tool_use).toEqual([{
               matcher: 'Shell',
               sequential: true,
               hooks: [{
                  command: 'echo pre',
                  timeout: 1,
                  name: 'audit',
               }],
            }]);
            expect(result.scopes.hooks.pre_tool_use).toBe('user');
            expect(result.paths.hooks.pre_tool_use).toBe(join(fakeHome, '.gemini', 'settings.json'));
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports OpenCode project rules, MCP, prompts, and skills', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-opencode-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME,
               originalUserProfile = process.env.USERPROFILE;

         process.env.HOME = fakeHome;
         process.env.USERPROFILE = fakeHome;

         try {
            const skillPath = join(projectRoot, '.opencode', 'skills', 'release');

            await mkdir(fakeHome, { recursive: true });
            await mkdir(join(projectRoot, '.opencode', 'commands'), { recursive: true });
            await mkdir(join(projectRoot, 'docs'), { recursive: true });
            await mkdir(skillPath, { recursive: true });
            await writeFile(join(projectRoot, 'AGENTS.md'), 'Use OpenCode.', 'utf-8');
            await writeFile(join(projectRoot, 'docs', 'rules.md'), 'Use imported instructions.', 'utf-8');
            await writeFile(
               join(projectRoot, 'opencode.json'),
               JSON.stringify({
                  instructions: ['docs/**/*.md'],
                  command: {
                     test: {
                        description: 'Test code',
                        template: 'Test this change.',
                     },
                  },
                  mcp: {
                     docs: {
                        type: 'remote',
                        url: 'https://example.com/mcp',
                     },
                  },
               }),
               'utf-8',
            );
            await writeFile(
               join(projectRoot, '.opencode', 'commands', 'review.md'),
               'Review this change.',
               'utf-8',
            );
            await writeFile(join(skillPath, 'SKILL.md'), '# Release', 'utf-8');

            const result = await importFromEditor('opencode', { projectRoot });

            expect(result.rules).toEqual([{
               name: 'AGENTS',
               content: 'Use OpenCode.',
               path: join(projectRoot, 'AGENTS.md'),
               scope: 'project',
            }, {
               name: 'rules',
               content: 'Use imported instructions.',
               path: join(projectRoot, 'docs', 'rules.md'),
               scope: 'project',
            }]);
            expect(result.mcp.docs).toEqual({ url: 'https://example.com/mcp' });
            expect(result.prompts.review).toBe('Review this change.');
            expect(result.prompts.test).toContain('description: "Test code"');
            expect(result.prompts.test).toContain('Test this change.');
            expect(result.skills.release).toBe(skillPath);
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            if (originalUserProfile === undefined) {
               delete process.env.USERPROFILE;
            } else {
               process.env.USERPROFILE = originalUserProfile;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports OpenCode project JSONC config', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-opencode-jsonc-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME,
               originalUserProfile = process.env.USERPROFILE;

         process.env.HOME = fakeHome;
         process.env.USERPROFILE = fakeHome;

         try {
            await mkdir(fakeHome, { recursive: true });
            await mkdir(join(projectRoot, 'docs'), { recursive: true });
            await writeFile(join(projectRoot, 'docs', 'rules.md'), 'Use JSONC instructions.', 'utf-8');
            await writeFile(
               join(projectRoot, 'opencode.jsonc'),
               `{
                  // OpenCode supports JSONC config.
                  "instructions": ["docs/rules.md"],
                  "command": {
                     "review": {
                        "description": "Review JSONC",
                        "template": "Review from JSONC.",
                     },
                  },
                  "mcp": {
                     "docs": {
                        "type": "remote",
                        "url": "https://example.com/mcp",
                     },
                  },
               }`,
               'utf-8',
            );

            const result = await importFromEditor('opencode', { projectRoot });

            expect(result.rules[0]?.content).toBe('Use JSONC instructions.');
            expect(result.prompts.review).toContain('Review from JSONC.');
            expect(result.mcp.docs).toEqual({ url: 'https://example.com/mcp' });
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            if (originalUserProfile === undefined) {
               delete process.env.USERPROFILE;
            } else {
               process.env.USERPROFILE = originalUserProfile;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports only the requested OpenCode scope when names overlap', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-opencode-scope-import-')),
               fakeHome = join(projectRoot, 'fake-home');
         const originalHome = process.env.HOME;

         process.env.HOME = fakeHome;

         try {
            await mkdir(join(fakeHome, '.config', 'opencode', 'commands'), { recursive: true });
            await mkdir(join(projectRoot, '.opencode', 'commands'), { recursive: true });
            await writeFile(
               join(fakeHome, '.config', 'opencode', 'opencode.json'),
               JSON.stringify({
                  mcp: {
                     docs: {
                        type: 'remote',
                        url: 'https://global.example.com/mcp',
                     },
                  },
               }),
               'utf-8',
            );
            await writeFile(
               join(projectRoot, 'opencode.json'),
               JSON.stringify({
                  mcp: {
                     docs: {
                        type: 'remote',
                        url: 'https://project.example.com/mcp',
                     },
                  },
               }),
               'utf-8',
            );
            await writeFile(
               join(fakeHome, '.config', 'opencode', 'commands', 'review.md'),
               'Review the global change.',
               'utf-8',
            );
            await writeFile(
               join(projectRoot, '.opencode', 'commands', 'review.md'),
               'Review the project change.',
               'utf-8',
            );

            const userResult = await importFromEditor('opencode', {
                     projectRoot,
                     scope: 'user',
                  }),
                  projectResult = await importFromEditor('opencode', {
                     projectRoot,
                     scope: 'project',
                  }),
                  combinedResult = await importFromEditor('opencode', {
                     projectRoot,
                     scope: 'all',
                  });

            expect(userResult.mcp.docs).toEqual({ url: 'https://global.example.com/mcp' });
            expect(userResult.prompts.review).toBe('Review the global change.');
            expect(userResult.scopes.mcp.docs).toBe('user');
            expect(userResult.scopes.prompts.review).toBe('user');

            expect(projectResult.mcp.docs).toEqual({ url: 'https://project.example.com/mcp' });
            expect(projectResult.prompts.review).toBe('Review the project change.');
            expect(projectResult.scopes.mcp.docs).toBe('project');
            expect(projectResult.scopes.prompts.review).toBe('project');

            expect(combinedResult.mcp.docs).toEqual({ url: 'https://project.example.com/mcp' });
            expect(combinedResult.prompts.review).toBe('Review the project change.');
            expect(combinedResult.scopes.mcp.docs).toBe('project');
            expect(combinedResult.scopes.prompts.review).toBe('project');
         } finally {
            if (originalHome === undefined) {
               delete process.env.HOME;
            } else {
               process.env.HOME = originalHome;
            }
            await rm(projectRoot, { recursive: true, force: true });
         }
      });
   });

   describe('buildConfigFromEditorImport', () => {
      it('normalizes imported names and preserves imported metadata where the source format exposes it', () => {
         const cursorImported: ImportResult = {
            mcp: {
               docs: { url: 'https://example.com/mcp' },
            },
            rules: [{
               name: 'API Rule',
               content: [
                  '---',
                  'description: "Use the API layer"',
                  'globs: src/**/*.ts, src/**/*.tsx',
                  'alwaysApply: false',
                  '---',
                  '',
                  'Use service wrappers.',
               ].join('\n'),
            }],
            skills: {
               'Release Skill': '/tmp/release-skill',
            },
            prompts: {},
            agents: {},
            hooks: {
               pre_command: [{
                  hooks: [{
                     command: 'echo pre',
                  }],
               }],
            },
            paths: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            scopes: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            warnings: [],
            sources: { global: false, local: false },
         };
         const copilotImported: ImportResult = {
            mcp: {},
            rules: [],
            skills: {},
            prompts: {
               'Review Prompt': [
                  '---',
                  'description: Review code',
                  'argument-hint: [path]',
                  'mode: ask',
                  '---',
                  '',
                  'Review this code.',
               ].join('\n'),
            },
            agents: {},
            hooks: {},
            paths: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            scopes: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            warnings: [],
            sources: { global: false, local: false },
         };

         const cursorConfig = buildConfigFromEditorImport('cursor', cursorImported),
               copilotConfig = buildConfigFromEditorImport('copilot', copilotImported);

         expect(cursorConfig.mcp.docs).toEqual({ url: 'https://example.com/mcp' });
         expect(cursorConfig.rules['api-rule']).toEqual({
            content: 'Use service wrappers.',
            description: 'Use the API layer',
            activation: 'glob',
            globs: ['src/**/*.ts', 'src/**/*.tsx'],
         });
         expect(cursorConfig.skills['release-skill']).toBe('/tmp/release-skill');
         expect(cursorConfig.hooks?.pre_command).toEqual([{
            hooks: [{
               command: 'echo pre',
            }],
         }]);
         expect(copilotConfig.prompts['review-prompt']).toEqual({
            content: 'Review this code.',
            description: 'Review code',
            argumentHint: 'path',
         });
      });
   });
});
