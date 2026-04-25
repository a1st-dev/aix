import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { safeRm } from '@a1st/aix-core';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '@oclif/test';

const __dirname = dirname(fileURLToPath(import.meta.url)),
      root = join(__dirname, '../..'),
      loadOpts = { root, devPlugins: false };
const execFileAsync = promisify(execFile),
      binPath = join(root, 'bin', 'run.js');
const runCli = (args: string[] | string, _unused?: unknown) =>
   runCommand(args, loadOpts, { testNodeEnv: 'production' });

/**
 * Helper to create a valid ai.json config
 */
function createValidConfig(overrides: Record<string, unknown> = {}): string {
   return JSON.stringify(
      {
         $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
         skills: {},
         mcp: {},
         rules: {},
         prompts: {},
         ...overrides,
      },
      null,
      2,
   );
}

/**
 * Write a valid config to a path
 */
async function writeValidConfig(
   path: string,
   overrides: Record<string, unknown> = {},
): Promise<void> {
   await writeFile(path, createValidConfig(overrides));
}

async function writeSkillDir(baseDir: string, name: string): Promise<void> {
   const skillDir = join(baseDir, 'skills', name);

   await mkdir(skillDir, { recursive: true });
   await writeFile(
      join(skillDir, 'SKILL.md'),
      `---
name: ${name}
description: Test skill ${name}
---

# ${name}
`,
   );
}

/**
 * Create a unique test directory for each test
 */
function createTestDir(): string {
   return join(tmpdir(), `aix-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('CLI Commands', () => {
   let testDir: string;
   let originalCwd: string;
   let originalHome: string | undefined;

   beforeEach(async () => {
      originalCwd = process.cwd();
      originalHome = process.env.HOME;
      testDir = createTestDir();
      await mkdir(testDir, { recursive: true });
      process.chdir(testDir);
   });

   afterEach(async () => {
      process.chdir(originalCwd);
      if (originalHome === undefined) {
         delete process.env.HOME;
      } else {
         process.env.HOME = originalHome;
      }
      await safeRm(testDir, { force: true });
   });

   describe('init', () => {
      it('creates a lockfile when requested', async () => {
         const { error } = await runCli(['init', '--lock'], {
            root,
         });

         expect(error).toBeUndefined();
         expect(existsSync(join(testDir, 'ai.json'))).toBe(true);
         expect(existsSync(join(testDir, 'ai.lock.json'))).toBe(true);

         const lockfile = JSON.parse(await readFile(join(testDir, 'ai.lock.json'), 'utf-8'));

         expect(lockfile.lockfileVersion).toBe(1);
         expect(lockfile.config.digest).toMatch(/^sha256:/);
      });
   });

   describe('validate', () => {
      it('validates a correct config file', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCli(['validate', '--config', configPath], {
            root,
         });

         expect(error).toBeUndefined();
      });

      it('creates and refreshes a lockfile when requested', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            rules: {
               style: { content: 'Use direct language.' },
            },
         });

         const first = await runCli(['validate', '--config', configPath, '--lock'], {
            root,
         });

         expect(first.error).toBeUndefined();
         expect(existsSync(join(testDir, 'ai.lock.json'))).toBe(true);

         await writeValidConfig(configPath, {
            rules: {
               style: { content: 'Use plain language.' },
            },
         });

         const stale = await runCli(['validate', '--config', configPath], {
            root,
         });

         expect(stale.error).toBeDefined();

         const refreshed = await runCli(['validate', '--config', configPath, '--lock'], {
            root,
         });

         expect(refreshed.error).toBeUndefined();
      });

      it('includes lockfile metadata in json output', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error, stdout } = await runCli(['validate', '--config', configPath, '--lock', '--json'], {
            root,
         });
         const result = JSON.parse(stdout);

         expect(error).toBeUndefined();
         expect(result.valid).toBe(true);
         expect(result.lockfilePath).toBe(join(testDir, 'ai.lock.json'));
      });

      it('rejects an invalid sibling lockfile', async () => {
         const configPath = join(testDir, 'ai.json'),
               lockfilePath = join(testDir, 'ai.lock.json');

         await writeValidConfig(configPath);
         await writeFile(lockfilePath, '{ "lockfileVersion": 1 }', 'utf-8');

         const { error } = await runCli(['validate', '--config', configPath], {
            root,
         });

         expect(error).toBeDefined();
      });

      it('reports error when no config found', async () => {
         const { error } = await runCli(['validate', '--config', 'nonexistent.json'], {
            root,
         });

         expect(error).toBeDefined();
      });
   });

   describe('install', () => {
      it('refreshes a stale local lockfile when saving a source config with --lock', async () => {
         const configPath = join(testDir, 'ai.json'),
               sourceDir = join(testDir, 'source'),
               sourcePath = join(sourceDir, 'ai.json');

         await mkdir(sourceDir, { recursive: true });
         await writeValidConfig(configPath, {
            rules: {
               local: { content: 'Local rule.' },
            },
         });
         await writeValidConfig(sourcePath, {
            rules: {
               remote: { content: 'Remote rule.' },
            },
         });

         const locked = await runCli(['validate', '--config', configPath, '--lock'], {
            root,
         });

         expect(locked.error).toBeUndefined();

         await writeValidConfig(configPath, {
            rules: {
               stale: { content: 'Stale local rule.' },
            },
         });

         const installed = await runCli(['install', sourcePath, '--save', '--lock'], {
            root,
         });

         expect(installed.error).toBeUndefined();

         const validated = await runCli(['validate', '--config', configPath], {
            root,
         });

         expect(validated.error).toBeUndefined();
      });
   });

   describe('sync', () => {
      it('rejects identical source and destination editors', async () => {
         const { error } = await runCli(['sync', 'cursor', '--to', 'cursor'], {
            root,
         });

         expect(error).toBeDefined();
      });

      it('defaults to user scope and reports unsupported destination rule writes', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.config', 'opencode'), { recursive: true });
         await writeFile(join(fakeHome, '.config', 'opencode', 'AGENTS.md'), 'Use global guidance.', 'utf-8');

         const { error, stdout, stderr } = await runCli(['sync', 'opencode', '--to', 'cursor', '--dry-run'], {
            root,
         });

         expect(error).toBeUndefined();
         expect(stdout).toContain('Imported from opencode (user)');
         expect(stderr).toContain('cursor cannot write rules at user scope');
         expect(stdout).toContain('No writable destination changes remain');
      });

      it('skips global-only destination config when project scope is requested', async () => {
         await writeFile(
            join(testDir, 'opencode.json'),
            JSON.stringify({
               mcp: {
                  docs: {
                     type: 'remote',
                     url: 'https://example.com/mcp',
                  },
               },
            }),
            'utf-8',
         );

         const { error, stdout, stderr } = await runCli(
            ['sync', 'opencode', '--to', 'windsurf', '--scope', 'project', '--dry-run'],
            {
               root,
            },
         );

         expect(error).toBeUndefined();
         expect(`${stdout}\n${stderr}`).toContain('Requested target scope is project');
      });

      it('surfaces source import warnings during sync', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.config', 'opencode'), { recursive: true });
         await writeFile(join(fakeHome, '.config', 'opencode', 'AGENTS.md'), 'Use global guidance.', 'utf-8');
         await writeFile(
            join(fakeHome, '.config', 'opencode', 'opencode.json'),
            '{ invalid json',
            'utf-8',
         );

         const { error, stderr } = await runCli(['sync', 'opencode', '--to', 'cursor', '--dry-run'], {
            root,
         });

         expect(error).toBeUndefined();
         expect(stderr).toContain('Failed to parse MCP config');
         expect(stderr).toContain('Failed to read OpenCode config');
      });

      it('syncs source hooks through the bridge to the destination adapter', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.cursor'), { recursive: true });
         await writeFile(
            join(fakeHome, '.cursor', 'hooks.json'),
            JSON.stringify({
               hooks: {
                  beforeShellExecution: [{
                     command: 'echo pre',
                  }],
               },
            }),
            'utf-8',
         );

         const { error, stdout } = await runCli(
            ['sync', 'cursor', '--to', 'claude-code', '--to-scope', 'project', '--dry-run'],
            {
               root,
            },
         );

         expect(error).toBeUndefined();
         expect(stdout).toContain('hooks: 1');
         expect(stdout).toContain('Hooks');
         expect(stdout).toContain('settings.json');
      });
   });

   describe('add skill', () => {
      it('refreshes a stale lockfile when adding with --lock', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            rules: {
               style: { content: 'Use direct language.' },
            },
         });

         const locked = await runCli(['validate', '--config', configPath, '--lock'], {
            root,
         });

         expect(locked.error).toBeUndefined();

         await writeValidConfig(configPath);
         await writeSkillDir(testDir, 'locked-skill');

         const added = await runCli(
            ['add', 'skill', './skills/locked-skill', '--config', configPath, '--lock'],
            { root },
         );

         expect(added.error).toBeUndefined();

         const validated = await runCli(['validate', '--config', configPath], {
            root,
         });

         expect(validated.error).toBeUndefined();
      });

      it('adds an npm skill by short name (convention: aix-skill-*)', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(['add', 'skill', 'typescript', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBe('aix-skill-typescript');
      });

      it('adds a skill with local path and infers name', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);
         await writeSkillDir(testDir, 'custom');

         await runCli(['add', 'skill', './skills/custom', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.custom).toEqual({ path: './skills/custom' });
      });

      it('normalizes a direct SKILL.md path to the containing skill directory', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);
         await writeSkillDir(testDir, 'directory-skill');

         await runCli(
            ['add', 'skill', './skills/directory-skill/SKILL.md', '--config', configPath],
            {
               root,
            },
         );

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['directory-skill']).toEqual({ path: './skills/directory-skill' });
      });

      it('adds a skill from GitHub tree URL and infers name/ref/path', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'skill',
               'https://github.com/anthropics/skills/tree/main/skills/pdf',
               '--config',
               configPath,
            ],
            { root },
         );

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.pdf).toEqual({
            git: 'https://github.com/anthropics/skills',
            ref: 'main',
            path: 'skills/pdf',
         });
      });

      it('treats skills library ids as GitHub repo paths', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'skill',
               'github/awesome-copilot/typescript-mcp-server-generator',
               '--config',
               configPath,
            ],
            { root },
         );

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['typescript-mcp-server-generator']).toEqual({
            git: 'https://github.com/github/awesome-copilot',
            path: 'typescript-mcp-server-generator',
         });
      });

      it('maps skills-library ids with colon separators to skills paths', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'skill',
               'google-labs-code/stitch-skills/react:components',
               '--config',
               configPath,
            ],
            { root },
         );

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['react-components']).toEqual({
            git: 'https://github.com/google-labs-code/stitch-skills',
            path: 'skills/react-components',
         });
      });

      it('defaults project config installs to project scope', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         await writeValidConfig(configPath, {
            editors: ['copilot'],
         });
         await writeSkillDir(testDir, 'project-default');

         await runCli(['add', 'skill', './skills/project-default', '--config', configPath], {
            root,
         });

         expect(existsSync(join(testDir, '.aix', 'skills', 'project-default'))).toBe(true);
         expect(existsSync(join(testDir, '.github', 'skills', 'project-default'))).toBe(true);
         expect(existsSync(join(fakeHome, '.aix', 'skills', 'project-default'))).toBe(false);
         expect(existsSync(join(fakeHome, '.github', 'skills', 'project-default'))).toBe(false);
      });
   });

   describe('remove skill', () => {
      it('removes a skill from config', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*' } });

         await runCli(['remove', 'skill', 'typescript', '--yes', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBeUndefined();
      });

      it('removes native skill symlinks from editor directories', async () => {
         const configPath = join(testDir, 'ai.json'),
               sourceSkillDir = join(testDir, '.aix', 'skills', 'demo-skill'),
               editorSkillDir = join(testDir, '.github', 'skills');

         await writeValidConfig(configPath, {
            skills: { 'demo-skill': './skills/demo-skill' },
            editors: ['copilot'],
         });
         await mkdir(sourceSkillDir, { recursive: true });
         await mkdir(editorSkillDir, { recursive: true });
         await writeFile(
            join(sourceSkillDir, 'SKILL.md'),
            `---
name: demo-skill
description: Demo skill
---
`,
         );
         await symlink(join('..', '..', '.aix', 'skills', 'demo-skill'), join(editorSkillDir, 'demo-skill'));

         await runCli(['remove', 'skill', 'demo-skill', '--yes', '--config', configPath], {
            root,
         });

         expect(existsSync(join(testDir, '.aix', 'skills', 'demo-skill'))).toBe(false);
         expect(existsSync(join(testDir, '.github', 'skills', 'demo-skill'))).toBe(false);
      });

      it('removes catalog-style skill names through their normalized config key', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            skills: {
               'react-components': {
                  git: 'https://github.com/google-labs-code/stitch-skills',
                  path: 'skills/react-components',
               },
            },
         });

         await runCli(['remove', 'skill', 'react:components', '--yes', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['react-components']).toBeUndefined();
      });
   });

   describe('list --all', () => {
      it('includes symlinked native editor skills', async () => {
         const sourceSkillDir = join(testDir, '.aix', 'skills', 'copilot-skill'),
               editorSkillDir = join(testDir, '.github', 'skills');

         await mkdir(sourceSkillDir, { recursive: true });
         await mkdir(editorSkillDir, { recursive: true });
         await writeFile(
            join(sourceSkillDir, 'SKILL.md'),
            `---
name: copilot-skill
description: Copilot skill
---
`,
         );
         await symlink(
            join('..', '..', '.aix', 'skills', 'copilot-skill'),
            join(editorSkillDir, 'copilot-skill'),
         );

         const { stdout } = await execFileAsync('node', [binPath, 'list', '--all', '--editor', 'copilot', '--json'], {
            cwd: testDir,
         });

         const parsed = JSON.parse(stdout);

         expect(parsed.copilot.skills['copilot-skill']).toMatchObject({
            source: 'external',
            scope: 'project',
         });
         expect(parsed.copilot.skills['copilot-skill'].path).toContain(
            '/.github/skills/copilot-skill',
         );
      });
   });

   describe('config set', () => {
      it('sets a config value', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(['config', 'set', 'skills.typescript', '"^1.0.0"', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBe('^1.0.0');
      });
   });
});
