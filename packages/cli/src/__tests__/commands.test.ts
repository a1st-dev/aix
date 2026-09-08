import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { safeRm } from '@a1st/aix-core';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const testDirname = dirname(fileURLToPath(import.meta.url)),
      root = join(testDirname, '../..');
const maxBuffer = 1024 * 1024 * 10,
      binPath = join(root, 'dist', 'cli.js');
const TEST_DIR_CLEANUP_RETRIES = 12,
      TEST_DIR_CLEANUP_DELAY_MS = 250,
      RETRYABLE_CLEANUP_ERROR_CODES = new Set([ 'EBUSY', 'ENOTEMPTY', 'EPERM' ]);

interface CommandResult {
   error?: Error;
   stdout: string;
   stderr: string;
}

function runCli(args: string[], _unused?: unknown): Promise<CommandResult> {
   return new Promise((resolve) => {
      execFile(
         'node',
         [binPath, ...args],
         {
            cwd: process.cwd(),
            env: {
               ...process.env,
               AIX_CACHE_DIR: join(process.cwd(), '.oclif', 'cache'),
               AIX_CONFIG_DIR: join(process.cwd(), '.oclif', 'config'),
               AIX_DATA_DIR: join(process.cwd(), '.oclif', 'data'),
               AIX_DISABLE_AUTOUPDATE: '1',
               NODE_ENV: 'production',
            },
            maxBuffer,
         },
         (error, stdout, stderr) => {
            resolve({
               error: error ?? undefined,
               stdout,
               stderr,
            });
         },
      );
   });
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
   return error instanceof Error && 'code' in error;
}

function shouldRetryCleanup(error: unknown, attempt: number): boolean {
   return (
      process.platform === 'win32' &&
      attempt < TEST_DIR_CLEANUP_RETRIES &&
      isErrnoException(error) &&
      typeof error.code === 'string' &&
      RETRYABLE_CLEANUP_ERROR_CODES.has(error.code)
   );
}

async function removeTestDir(path: string, attempt: number = 0): Promise<void> {
   try {
      await safeRm(path, { force: true });
   } catch (error) {
      if (!shouldRetryCleanup(error, attempt)) {
         throw error;
      }

      const nextAttempt = attempt + 1;

      await delay(TEST_DIR_CLEANUP_DELAY_MS * nextAttempt);

      return removeTestDir(path, nextAttempt);
   }
}

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
      await removeTestDir(testDir);
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
      it('directly installs a user-scope Claude Code MCP server without ai.json', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         const { error } = await runCli(
            [
               'install',
               '--type',
               'mcp',
               '--target',
               'claude-code',
               '--user',
               '--name',
               'demo',
               '--command',
               'npx demo-mcp',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         expect(existsSync(join(testDir, 'ai.json'))).toBe(false);

         const content = await readFile(join(fakeHome, '.claude.json'), 'utf-8'),
               config = JSON.parse(content);

         expect(config.mcpServers.demo).toEqual({
            type: 'stdio',
            command: 'npx demo-mcp',
         });
      });

      it('includes redacted transient config in direct dry-run json output', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         const { error, stdout } = await runCli(
            [
               'install',
               '--type',
               'mcp',
               '--target',
               'claude-code',
               '--user',
               '--name',
               'demo',
               '--command',
               'npx demo-mcp',
               '--env',
               'TOKEN=secret',
               '--dry-run',
               '--json',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const result = JSON.parse(stdout);

         expect(stdout).not.toContain('secret');
         expect(result.directInstall.transientConfig.mcp.demo.env.TOKEN).toBe('<redacted>');
         expect(result.results[0].changes[0].content).toContain('<redacted>');
         expect(result.results[0].changes[0].path).toBe(join(fakeHome, '.claude.json'));
         expect(existsSync(join(fakeHome, '.claude.json'))).toBe(false);
      });

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

      it('does not prompt to save detected editors when installing a source config', async () => {
         const configPath = join(testDir, 'ai.json'),
               sourceDir = join(testDir, 'source'),
               sourcePath = join(sourceDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await mkdir(sourceDir, { recursive: true });
         await writeValidConfig(configPath);
         await writeValidConfig(sourcePath, {
            rules: {
               remote: { content: 'Remote rule.' },
            },
         });

         const installed = await runCli(['install', sourcePath], {
            root,
         });
         const localConfig = JSON.parse(await readFile(configPath, 'utf-8'));

         expect(installed.error).toBeUndefined();
         expect(`${installed.stdout}\n${installed.stderr}`).not.toContain('Save "claude-code" as the default editor');
         expect(localConfig.editors).toBeUndefined();
         expect(existsSync(join(testDir, '.claude/rules/remote.md'))).toStrictEqual(true);
      });
   });

   describe('install state tracking', () => {
      it('records every installed section so listings mark the items as aix-managed', async () => {
         const configPath = join(testDir, 'ai.json');

         process.env.HOME = join(testDir, 'fake-home');
         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
            rules: { style: { content: 'Be direct.' } },
            hooks: { pre_command: [ { hooks: [ { command: './lint.sh' } ] } ] },
         });

         const { error } = await runCli(['install', '--config', configPath], { root });

         expect(error).toBeUndefined();

         const state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.mcp)).toEqual(['demo']);
         expect(Object.keys(state.installed.rules)).toEqual(['style']);
         expect(Object.keys(state.installed.hooks)).toEqual(['pre_command']);

         const { stdout } = await runCli(
            ['list', '--all', '--editor', 'claude-code', '--config', configPath],
            { root },
         );
         const rows = stdout.split('\n').filter((line) => /\bproject\b/.test(line));

         expect(rows).toHaveLength(3);
         expect(rows.every((row) => row.includes(' aix '))).toStrictEqual(true);
      });

      it('stops tracking an item that was dropped from ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' }, extra: { command: 'npx extra' } },
         });
         await runCli(['install', '--config', configPath], { root });

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
         });
         await runCli(['install', '--config', configPath], { root });

         const state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.mcp)).toEqual(['demo']);
      });

      it('leaves sections outside --only untouched', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
            rules: { style: { content: 'Be direct.' } },
         });
         await runCli(['install', '--config', configPath], { root });
         await runCli(['install', '--only', 'mcp', '--config', configPath], { root });

         const state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.rules)).toEqual(['style']);
      });

      it('records nothing on a dry run', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
         });

         const { error } = await runCli(['install', '--dry-run', '--config', configPath], { root });

         expect(error).toBeUndefined();
         expect(existsSync(join(testDir, '.aix', 'state.json'))).toStrictEqual(false);
      });

      it('adds a directly installed item without dropping the rest of the section', async () => {
         const configPath = join(testDir, 'ai.json'),
               mcpPath = join(testDir, 'other.json');

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
         });
         await runCli(['install', '--config', configPath], { root });
         await writeFile(mcpPath, JSON.stringify({ command: 'npx other' }));

         const { error } = await runCli(
            ['install', mcpPath, '--type', 'mcp', '--name', 'other', '--target', 'claude-code'],
            { root },
         );

         expect(error).toBeUndefined();

         const state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.mcp).toSorted()).toEqual(['demo', 'other']);
      });
   });

   describe('add mcp and remove mcp', () => {
      it('removes a user-scope MCP server from the same detected editors add installs to', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await mkdir(join(fakeHome, '.config', 'github-copilot'), { recursive: true });
         await mkdir(join(fakeHome, '.gemini', 'config'), { recursive: true });
         await mkdir(join(fakeHome, '.config', 'opencode'), { recursive: true });
         await mkdir(join(fakeHome, 'AppData', 'Roaming', 'opencode'), { recursive: true });

         const added = await runCli(
            [
               'add',
               'mcp',
               'pieces',
               '--url',
               'http://localhost:39300/model_context_protocol/2025-03-26/mcp',
               '--user',
            ],
            { root },
         );

         expect(added.error).toBeUndefined();

         const claudePath = join(fakeHome, '.claude.json'),
               copilotPath = join(fakeHome, '.config', 'github-copilot', 'mcp-config.json'),
               antigravityPath = join(fakeHome, '.gemini', 'config', 'mcp_config.json'),
               opencodePath = join(fakeHome, '.config', 'opencode', 'opencode.json');

         expect(JSON.parse(await readFile(claudePath, 'utf-8')).mcpServers.pieces).toBeDefined();
         expect(JSON.parse(await readFile(copilotPath, 'utf-8')).mcpServers.pieces).toBeDefined();
         expect(JSON.parse(await readFile(antigravityPath, 'utf-8')).mcpServers.pieces).toBeDefined();
         expect(JSON.parse(await readFile(opencodePath, 'utf-8')).mcp.pieces).toBeDefined();

         const removed = await runCli(['remove', 'mcp', 'pieces', '--user', '--yes'], { root });

         expect(removed.error).toBeUndefined();
         expect(JSON.parse(await readFile(claudePath, 'utf-8')).mcpServers.pieces).toBeUndefined();
         expect(JSON.parse(await readFile(copilotPath, 'utf-8')).mcpServers.pieces).toBeUndefined();
         expect(JSON.parse(await readFile(antigravityPath, 'utf-8')).mcpServers.pieces).toBeUndefined();
         expect(JSON.parse(await readFile(opencodePath, 'utf-8')).mcp.pieces).toBeUndefined();
      });

      it('uses --target to limit add and remove MCP editor writes', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         const added = await runCli(
            [
               'add',
               'mcp',
               'targeted',
               '--url',
               'http://localhost:39300/model_context_protocol/2025-03-26/mcp',
               '--user',
               '--target',
               'claude-code',
            ],
            { root },
         );

         expect(added.error).toBeUndefined();

         const claudePath = join(fakeHome, '.claude.json'),
               copilotPath = join(fakeHome, '.config', 'github-copilot', 'mcp-config.json');

         expect(JSON.parse(await readFile(claudePath, 'utf-8')).mcpServers.targeted).toBeDefined();
         expect(existsSync(copilotPath)).toStrictEqual(false);

         const removed = await runCli(
            ['remove', 'mcp', 'targeted', '--user', '--yes', '--target', 'claude-code'],
            { root },
         );

         expect(removed.error).toBeUndefined();
         expect(JSON.parse(await readFile(claudePath, 'utf-8')).mcpServers.targeted).toBeUndefined();
         expect(existsSync(copilotPath)).toStrictEqual(false);
      });

      it('uses --target even when ai.json has no configured editors', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await writeValidConfig(configPath);

         const added = await runCli(
            [
               'add',
               'mcp',
               'configured',
               '--url',
               'http://localhost:39300/model_context_protocol/2025-03-26/mcp',
               '--user',
               '--target',
               'claude-code',
               '--config',
               configPath,
            ],
            { root },
         );

         expect(added.error).toBeUndefined();

         const claudePath = join(fakeHome, '.claude.json');

         expect(JSON.parse(await readFile(claudePath, 'utf-8')).mcpServers.configured).toBeDefined();
      });
   });

   describe('sync', () => {
      it('rejects identical source and destination editors', async () => {
         const { error } = await runCli(['sync', 'cursor', '--to', 'cursor'], {
            root,
         });

         expect(error).toBeDefined();
      });

      it('rejects devin and windsurf as the same sync editor', async () => {
         const { error, stderr } = await runCli(['sync', 'devin', '--to', 'windsurf'], {
            root,
         });

         expect(error).toBeDefined();
         expect(stderr).toContain('Source and destination editors must differ.');
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

      it('accepts devin as a Windsurf sync destination alias', async () => {
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
            ['sync', 'opencode', '--to', 'devin', '--scope', 'project', '--dry-run'],
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

      it('syncs windsurf user-scope config into Claude Code user files', async () => {
         const fakeHome = join(testDir, 'fake-home'),
               windsurfDir = join(fakeHome, '.codeium', 'windsurf');

         process.env.HOME = fakeHome;
         await mkdir(join(windsurfDir, 'memories'), { recursive: true });
         await mkdir(join(windsurfDir, 'global_workflows'), { recursive: true });
         await writeFile(
            join(windsurfDir, 'memories', 'global_rules.md'),
            '---\ntrigger: always_on\n---\n\nPrefer readability over brevity.\n',
            'utf-8',
         );
         await writeFile(
            join(windsurfDir, 'global_workflows', 'deploy.md'),
            '---\ndescription: Deploy the service\n---\n\nRun the deploy script.\n',
            'utf-8',
         );
         await writeFile(
            join(windsurfDir, 'mcp_config.json'),
            JSON.stringify({
               mcpServers: {
                  docs: { serverUrl: 'https://example.com/mcp' },
               },
            }),
            'utf-8',
         );
         await writeFile(
            join(windsurfDir, 'hooks.json'),
            JSON.stringify({
               hooks: {
                  pre_run_command: [{ command: 'echo before-command' }],
               },
            }),
            'utf-8',
         );
         // Pre-existing personal content that the sync must not clobber
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await writeFile(
            join(fakeHome, '.claude', 'CLAUDE.md'),
            '# Personal notes\n\nKeep this text.\n',
            'utf-8',
         );

         const { error, stdout } = await runCli(['sync', 'windsurf', '--to', 'claude-code'], {
            root,
         });

         expect(error).toBeUndefined();
         expect(stdout).toContain('Imported from windsurf (user)');
         expect(stdout).toContain('MCP servers: 1');

         const claudeMd = await readFile(join(fakeHome, '.claude', 'CLAUDE.md'), 'utf-8'),
               rule = await readFile(join(fakeHome, '.claude', 'rules', 'global.md'), 'utf-8'),
               command = await readFile(join(fakeHome, '.claude', 'commands', 'deploy.md'), 'utf-8'),
               mcp = JSON.parse(await readFile(join(fakeHome, '.claude.json'), 'utf-8')),
               settings = JSON.parse(
                  await readFile(join(fakeHome, '.claude', 'settings.json'), 'utf-8'),
               );

         expect(claudeMd).toContain('Keep this text.');
         expect(claudeMd).toContain('@rules/global.md');
         expect(rule).toContain('Prefer readability over brevity.');
         expect(command).toContain('Run the deploy script.');
         expect(mcp.mcpServers.docs).toEqual({ type: 'http', url: 'https://example.com/mcp' });
         expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('echo before-command');
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

      it('records synced items so the destination lists them as aix-managed', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.cursor'), { recursive: true });
         await writeFile(
            join(fakeHome, '.cursor', 'hooks.json'),
            JSON.stringify({ hooks: { beforeShellExecution: [{ command: 'echo pre' }] } }),
            'utf-8',
         );

         const { error } = await runCli(['sync', 'cursor', '--to', 'claude-code'], { root });

         expect(error).toBeUndefined();

         const state = JSON.parse(await readFile(join(fakeHome, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.hooks)).toEqual(['pre_command']);

         const { stdout } = await runCli(['list', '-u', '--editor', 'claude-code'], { root });

         expect(stdout).toContain('aix');
         expect(stdout).toContain('pre_command');
      });
   });

   describe('add rule', () => {
      it('adds multiple local rule files from shell-expanded arguments', async () => {
         const configPath = join(testDir, 'ai.json'),
               rulesDir = join(testDir, 'rules');

         await writeValidConfig(configPath);
         await mkdir(rulesDir, { recursive: true });
         await writeFile(join(rulesDir, 'coding-standards.md'), 'Use direct language.');
         await writeFile(join(rulesDir, 'commit-standards.md'), 'Use conventional commits.');

         const { error } = await runCli(
            [
               'add',
               'rule',
               './rules/coding-standards.md',
               './rules/commit-standards.md',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.rules['coding-standards']).toBe('./rules/coding-standards.md');
         expect(config.rules['commit-standards']).toBe('./rules/commit-standards.md');
      });

      it('rejects source-specific metadata flags with multiple rule sources', async () => {
         const configPath = join(testDir, 'ai.json'),
               rulesDir = join(testDir, 'rules');

         await writeValidConfig(configPath);
         await mkdir(rulesDir, { recursive: true });
         await writeFile(join(rulesDir, 'one.md'), 'One');
         await writeFile(join(rulesDir, 'two.md'), 'Two');

         const { error, stderr } = await runCli(
            [
               'add',
               'rule',
               './rules/one.md',
               './rules/two.md',
               '--description',
               'Only one rule',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeDefined();
         expect(stderr).toContain('These flags can only be used with one source: --description');
      });
   });

   describe('add prompt', () => {
      it('adds multiple local prompt files from shell-expanded arguments', async () => {
         const configPath = join(testDir, 'ai.json'),
               promptsDir = join(testDir, 'prompts');

         await writeValidConfig(configPath);
         await mkdir(promptsDir, { recursive: true });
         await writeFile(join(promptsDir, 'review.md'), 'Review this code.');
         await writeFile(join(promptsDir, 'plan.md'), 'Plan this change.');

         const { error } = await runCli(
            [
               'add',
               'prompt',
               './prompts/review.md',
               './prompts/plan.md',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.prompts.review).toBe('./prompts/review.md');
         expect(config.prompts.plan).toBe('./prompts/plan.md');
      });

      it('rejects source-specific metadata flags with multiple prompt sources', async () => {
         const configPath = join(testDir, 'ai.json'),
               promptsDir = join(testDir, 'prompts');

         await writeValidConfig(configPath);
         await mkdir(promptsDir, { recursive: true });
         await writeFile(join(promptsDir, 'review.md'), 'Review this code.');
         await writeFile(join(promptsDir, 'plan.md'), 'Plan this change.');

         const { error, stderr } = await runCli(
            [
               'add',
               'prompt',
               './prompts/review.md',
               './prompts/plan.md',
               '--argument-hint',
               '[file]',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeDefined();
         expect(stderr).toContain('These flags can only be used with one source: --argument-hint');
      });
   });

   describe('add hook and list hooks', () => {
      it('adds an inline hook to ai.json and installs it to the target editor', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCli(
            [
               'add',
               'hook',
               'pre_command',
               '--command',
               'npm run lint',
               '--target',
               'claude-code',
               '--config',
               configPath,
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const config = JSON.parse(await readFile(configPath, 'utf-8')),
               settings = JSON.parse(await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8'));

         expect(config.hooks.pre_command[0].hooks[0].command).toStrictEqual('npm run lint');
         expect(settings.hooks.PreToolUse[0].matcher).toStrictEqual('Bash');
         expect(settings.hooks.PreToolUse[0].hooks[0].command).toStrictEqual('npm run lint');
      });

      it('appends to an event that already has a hook instead of replacing it', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_command: [ { hooks: [ { command: './lint.sh' } ] } ],
            },
         });

         const { error } = await runCli(
            [
               'add',
               'hook',
               'pre_command',
               '--command',
               './audit.sh',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const config = JSON.parse(await readFile(configPath, 'utf-8'));

         expect(config.hooks.pre_command).toHaveLength(2);
         expect(config.hooks.pre_command[0].hooks[0].command).toStrictEqual('./lint.sh');
         expect(config.hooks.pre_command[1].hooks[0].command).toStrictEqual('./audit.sh');
      });

      it('adds a hook from a local JSON fragment', async () => {
         const configPath = join(testDir, 'ai.json'),
               hooksDir = join(testDir, 'hooks');

         await writeValidConfig(configPath);
         await mkdir(hooksDir, { recursive: true });
         await writeFile(
            join(hooksDir, 'guard.json'),
            JSON.stringify({
               event: 'pre_file_write',
               matcher: 'Write|Edit',
               hooks: [ { command: './scripts/guard.sh', timeout: 10 } ],
            }),
         );

         const { error } = await runCli(
            ['add', 'hook', './hooks/guard.json', '--config', configPath, '--no-install'],
            { root },
         );

         expect(error).toBeUndefined();

         const config = JSON.parse(await readFile(configPath, 'utf-8'));

         expect(config.hooks.pre_file_write[0].matcher).toStrictEqual('Write|Edit');
         expect(config.hooks.pre_file_write[0].hooks[0].timeout).toStrictEqual(10);
      });

      it('installs a user-scope hook without an ai.json', async () => {
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         const { error } = await runCli(
            [
               'add',
               'hook',
               'post_command',
               '--command',
               './notify.sh',
               '--user',
               '--target',
               'claude-code',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const settings = JSON.parse(
            await readFile(join(fakeHome, '.claude', 'settings.json'), 'utf-8'),
         );

         expect(settings.hooks.PostToolUse[0].hooks[0].command).toStrictEqual('./notify.sh');
      });

      it('installs a directory_added hook to Claude Code and warns for Codex', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error, stdout, stderr } = await runCli(
            [
               'add',
               'hook',
               'directory_added',
               '--command',
               './on-add-dir.sh',
               '--config',
               configPath,
               '--target',
               'claude-code',
               '--target',
               'codex',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const settings = JSON.parse(
            await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8'),
         );

         expect(settings.hooks.DirectoryAdded[0].hooks[0].command).toStrictEqual('./on-add-dir.sh');
         expect(stdout + stderr).toContain('directory_added');
      });

      it('installs a Codex hook with async and a Windows command', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);
         await runCli(
            ['add', 'hook', 'post_compact', '--command', './cleanup.sh', '--config', configPath, '--no-install'],
            { root },
         );

         const config = JSON.parse(await readFile(configPath, 'utf-8'));

         config.hooks.post_compact[0].hooks[0].async = true;
         config.hooks.post_compact[0].hooks[0].powershell = 'Write-Host cleanup';
         await writeFile(configPath, JSON.stringify(config, null, 2));

         const { error } = await runCli(
            ['install', '--config', configPath, '--target', 'codex'],
            { root },
         );

         expect(error).toBeUndefined();

         const hooks = JSON.parse(await readFile(join(testDir, '.codex', 'hooks.json'), 'utf-8'));

         expect(hooks.hooks.PostCompact[0].hooks[0]).toStrictEqual({
            type: 'command',
            command: './cleanup.sh',
            commandWindows: 'Write-Host cleanup',
            async: true,
         });
      });

      it('reports the valid events when given an unknown event name', async () => {
         const { error, stderr } = await runCli(['add', 'hook', 'pre_commnd', '--command', 'x'], {
            root,
         });

         expect(error).toBeDefined();
         expect(stderr).toContain('Unknown hook event "pre_commnd"');
         expect(stderr).toContain('pre_command');
      });

      it('requires an action for an inline hook', async () => {
         const { error, stderr } = await runCli(['add', 'hook', 'session_start'], { root });

         expect(error).toBeDefined();
         expect(stderr).toContain('Provide --command, --url, or --prompt');
      });

      it('lists configured hooks with their matcher and action', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_file_write: [
                  { matcher: 'Write|Edit', hooks: [ { command: './scripts/guard.sh' } ] },
               ],
            },
         });

         const { error, stdout } = await runCli(['list', 'hooks', '--config', configPath], { root });

         expect(error).toBeUndefined();
         expect(stdout).toContain('pre_file_write');
         expect(stdout).toContain('Write|Edit');
         expect(stdout).toContain('./scripts/guard.sh');
      });
   });

   describe('remove hook', () => {
      it('removes the event from ai.json and from the editor hooks config', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'hook',
               'pre_command',
               '--command',
               './lint.sh',
               '--target',
               'claude-code',
               '--config',
               configPath,
            ],
            { root },
         );

         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'claude-code', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();

         const config = JSON.parse(await readFile(configPath, 'utf-8')),
               settings = JSON.parse(await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8'));

         expect(config.hooks).toBeUndefined();
         expect(settings.hooks).toBeUndefined();
      });

      it('cleans the editors state recorded, without needing --target on removal', async () => {
         const configPath = join(testDir, 'ai.json');

         // An isolated home means no editor is detected as globally installed, so the
         // removal can only find its targets by what the install recorded.
         process.env.HOME = join(testDir, 'fake-home');

         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'hook',
               'pre_command',
               '--command',
               './lint.sh',
               '--target',
               'claude-code',
               '--target',
               'codex',
               '--config',
               configPath,
            ],
            { root },
         );

         // No --target here: the removal has to learn the editor set from state, the way
         // a user who just runs `aix remove hook <event>` would.
         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();

         const settings = JSON.parse(await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8')),
               codexHooks = JSON.parse(await readFile(join(testDir, '.codex', 'hooks.json'), 'utf-8'));

         expect(settings.hooks).toBeUndefined();
         expect(codexHooks.hooks).toBeUndefined();
      });

      it('leaves hooks from other events that share a native event name', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_command: [ { hooks: [ { command: './lint.sh' } ] } ],
               pre_file_write: [ { hooks: [ { command: './guard.sh' } ] } ],
            },
         });

         await runCli(
            ['install', '--target', 'claude-code', '--config', configPath],
            { root },
         );

         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'claude-code', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();

         const settings = JSON.parse(await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8')),
               matchers = settings.hooks.PreToolUse.map(
                  (group: { matcher: string }) => group.matcher,
               );

         expect(matchers).toEqual(['Write|Edit']);
      });

      it('removes a user-scope hook without touching project ai.json', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await writeValidConfig(configPath);

         await runCli(
            ['add', 'hook', 'session_start', '--command', './boot.sh', '--user', '--target', 'claude-code'],
            { root },
         );

         const settingsPath = join(fakeHome, '.claude', 'settings.json');

         expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.SessionStart).toBeDefined();

         const { error } = await runCli(
            ['remove', 'hook', 'session_start', '--yes', '--user', '--target', 'claude-code'],
            { root },
         );

         expect(error).toBeUndefined();
         expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks).toBeUndefined();
      });

      it('reports that an editor without hooks support had nothing to remove', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_command: [ { hooks: [ { command: './lint.sh' } ] } ],
            },
         });

         const { error, stdout, stderr } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'zed', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();
         expect(stdout + stderr).toContain('zed does not support hooks');
      });

      it('rejects an unknown hook event', async () => {
         const { error, stderr } = await runCli(['remove', 'hook', 'nope', '--yes'], { root });

         expect(error).toBeDefined();
         expect(stderr).toContain('Unknown hook event "nope"');
      });
   });

   describe('hooks in editor listings and install warnings', () => {
      it('lists hooks found in editor config and marks aix-managed events', async () => {
         const configPath = join(testDir, 'ai.json');

         process.env.HOME = join(testDir, 'fake-home');
         await writeValidConfig(configPath);

         await runCli(
            [
               'add',
               'hook',
               'pre_command',
               '--command',
               './lint.sh',
               '--target',
               'claude-code',
               '--config',
               configPath,
            ],
            { root },
         );

         const settingsPath = join(testDir, '.claude', 'settings.json'),
               settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

         settings.hooks.SessionStart = [
            { matcher: '', hooks: [ { type: 'command', command: './handwritten.sh' } ] },
         ];
         await writeFile(settingsPath, JSON.stringify(settings, null, 2));

         const { error, stdout } = await runCli(
            ['list', '--all', '--editor', 'claude-code', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();
         expect(stdout).toContain('pre_command');
         expect(stdout).toContain('session_start');
         expect(stdout).toContain('hook');
      });

      it('warns that an editor without hooks support installed none of them', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_command: [ { hooks: [ { command: './lint.sh' } ] } ],
            },
         });

         const { error, stdout, stderr } = await runCli(
            ['install', '--target', 'zed', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();
         expect(stdout + stderr).toContain('zed does not support hooks');
      });

      it('warns about hook action fields the editor drops', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            hooks: {
               pre_command: [ { hooks: [ { command: './lint.sh', show_output: true } ] } ],
            },
         });

         const { error, stdout, stderr } = await runCli(
            ['install', '--target', 'claude-code', '--config', configPath],
            { root },
         );

         expect(error).toBeUndefined();
         expect(stdout + stderr).toContain('ignores these fields on hook pre_command');
         expect(stdout + stderr).toContain('show_output');
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

      it('does not read or modify project ai.json for user-scope skill adds', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         await writeValidConfig(configPath, {
            editors: ['claude-code'],
            skills: {
               'project-skill': { path: './skills/project-skill' },
            },
         });
         await writeSkillDir(testDir, 'project-skill');
         await writeSkillDir(testDir, 'user-skill');

         const before = await readFile(configPath, 'utf-8'),
               { error } = await runCli(
                  ['add', 'skill', './skills/user-skill', '--target', 'claude-code', '--user'],
                  { root },
               ),
               after = await readFile(configPath, 'utf-8');

         expect(error).toBeUndefined();
         expect(after).toBe(before);
         expect(existsSync(join(fakeHome, '.aix', 'skills', 'user-skill', 'SKILL.md'))).toBe(true);
         expect(existsSync(join(fakeHome, '.claude', 'skills', 'user-skill'))).toBe(true);
         expect(existsSync(join(fakeHome, '.aix', 'skills', 'project-skill'))).toBe(false);
         expect(existsSync(join(testDir, '.aix', 'skills', 'user-skill'))).toBe(false);
      });

      it('ignores invalid project ai.json for user-scope skill adds', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         await writeFile(configPath, '{ invalid json');
         await writeSkillDir(testDir, 'user-skill');

         const { error, stderr } = await runCli(
            ['add', 'skill', './skills/user-skill', '--target', 'claude-code', '--user'],
            { root },
         );

         expect(error).toBeUndefined();
         expect(stderr).not.toContain('Configuration Error');
         expect(existsSync(join(fakeHome, '.aix', 'skills', 'user-skill', 'SKILL.md'))).toBe(true);
      });

      it('adds multiple local skill directories from shell-expanded arguments', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);
         await writeSkillDir(testDir, 'alpha-skill');
         await writeSkillDir(testDir, 'beta-skill');

         const { error } = await runCli(
            [
               'add',
               'skill',
               './skills/alpha-skill',
               './skills/beta-skill',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();

         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.skills['alpha-skill']).toEqual({ path: './skills/alpha-skill' });
         expect(config.skills['beta-skill']).toEqual({ path: './skills/beta-skill' });
      });

      it('rejects source-specific flags with multiple skill sources', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);
         await writeSkillDir(testDir, 'alpha-skill');
         await writeSkillDir(testDir, 'beta-skill');

         const { error, stderr } = await runCli(
            [
               'add',
               'skill',
               './skills/alpha-skill',
               './skills/beta-skill',
               '--name',
               'shared-name',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeDefined();
         expect(stderr).toContain('These flags can only be used with one source: --name');
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

         process.env.HOME = join(testDir, 'fake-home');
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

         const { error, stdout } = await runCli(['list', '--all', '--editor', 'copilot', '--json']);

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.copilot.skills['copilot-skill']).toMatchObject({
            source: 'external',
            scope: 'project',
         });
         expect(parsed.copilot.skills['copilot-skill'].path).toContain(
            '/.github/skills/copilot-skill',
         );
      });

      it('accepts devin as a Windsurf editor filter alias', async () => {
         const sourceSkillDir = join(testDir, '.aix', 'skills', 'devin-skill'),
               editorSkillDir = join(testDir, '.windsurf', 'skills');

         process.env.HOME = join(testDir, 'fake-home');
         await mkdir(sourceSkillDir, { recursive: true });
         await mkdir(editorSkillDir, { recursive: true });
         await writeFile(
            join(sourceSkillDir, 'SKILL.md'),
            `---
name: devin-skill
description: Devin skill
---
`,
         );
         await symlink(
            join('..', '..', '.aix', 'skills', 'devin-skill'),
            join(editorSkillDir, 'devin-skill'),
         );

         const { error, stdout } = await runCli(['list', '--all', '--editor', 'devin', '--json']);

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.devin).toBeUndefined();
         expect(parsed.windsurf.skills['devin-skill']).toMatchObject({
            source: 'external',
            scope: 'project',
         });
      });
   });

   describe('list -u', () => {
      it('lists user-scope items by scanning editors global config directories', async () => {
         const fakeHome = join(testDir, 'home'),
               userSkillDir = join(
                  fakeHome,
                  '.config',
                  'github-copilot',
                  'skills',
                  'user-copilot-skill',
               );

         await mkdir(userSkillDir, { recursive: true });
         await writeFile(
            join(userSkillDir, 'SKILL.md'),
            `---
name: user-copilot-skill
description: User Copilot skill
---
`,
         );

         process.env.HOME = fakeHome;

         const { error, stdout } = await runCli(['list', '-u', '--json']);

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.copilot.skills['user-copilot-skill']).toMatchObject({
            source: 'external',
            scope: 'user',
         });
         expect(parsed.copilot.skills['user-copilot-skill'].path).toContain(
            '.config/github-copilot/skills/user-copilot-skill',
         );
      });

      it('prints user-scope items in text output', async () => {
         const fakeHome = join(testDir, 'home'),
               userSkillDir = join(
                  fakeHome,
                  '.config',
                  'github-copilot',
                  'skills',
                  'user-copilot-skill',
               );

         await mkdir(userSkillDir, { recursive: true });
         await writeFile(
            join(userSkillDir, 'SKILL.md'),
            `---
name: user-copilot-skill
description: User Copilot skill
---
`,
         );

         process.env.HOME = fakeHome;

         const { error, stdout } = await runCli(['list', '-u']);

         expect(error).toBeUndefined();
         expect(stdout).toContain('user-copilot-skill');
         expect(stdout).toContain('user');
      });

      it('lists opencode user skills from claude and agents compatibility dirs', async () => {
         const fakeHome = join(testDir, 'home-opencode'),
               claudeSkillDir = join(fakeHome, '.claude', 'skills', 'user-claude-skill'),
               agentsSkillDir = join(fakeHome, '.agents', 'skills', 'user-agents-skill');

         await mkdir(claudeSkillDir, { recursive: true });
         await mkdir(agentsSkillDir, { recursive: true });
         await writeFile(
            join(claudeSkillDir, 'SKILL.md'),
            `---
name: user-claude-skill
description: User Claude skill
---
`,
         );
         await writeFile(
            join(agentsSkillDir, 'SKILL.md'),
            `---
name: user-agents-skill
description: User Agents skill
---
`,
         );

         process.env.HOME = fakeHome;

         const { error, stdout } = await runCli(['list', '-u', '--json']);

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.opencode.skills['user-claude-skill']).toMatchObject({
            source: 'external',
            scope: 'user',
         });
         expect(parsed.opencode.skills['user-claude-skill'].path).toContain(
            '.claude/skills/user-claude-skill',
         );
         expect(parsed.opencode.skills['user-agents-skill']).toMatchObject({
            source: 'external',
            scope: 'user',
         });
         expect(parsed.opencode.skills['user-agents-skill'].path).toContain(
            '.agents/skills/user-agents-skill',
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

   describe('plugins commands', () => {
      it('adds a plugin to ai.json with shorthand', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCli(
            ['add', 'plugin', 'code-review@claude-plugins-official', '--config', configPath, '--no-install'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.plugins['code-review@claude-plugins-official']).toEqual(true);
      });

      it('lists plugins in JSON format', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            plugins: {
               'code-review': true,
               '@scope/helper': { enabled: true, source: './plugins/helper' },
            },
         });

         const { error, stdout } = await runCli(['list', 'plugins', '--config', configPath, '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.plugins['code-review']).toEqual(true);
         expect(parsed.plugins['@scope/helper']).toMatchObject({ enabled: true });
      });

      it('removes a plugin from ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            plugins: {
               'code-review': true,
            },
         });

         const { error } = await runCli(
            ['remove', 'plugin', 'code-review', '--yes', '--config', configPath, '--no-install'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.plugins['code-review']).toBeUndefined();
      });

      it('warns when installing plugins to Cursor at user scope', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            plugins: {
               'code-review': true,
            },
         });

         const { stderr, stdout } = await runCli(
            ['install', '--scope', 'user', '--target', 'cursor', '--config', configPath],
            { root },
         );

         const output = `${stdout} ${stderr}`;

         expect(output).toContain('cursor cannot write plugins at user scope');
      });
   });

   describe('marketplaces commands', () => {
      it('adds a marketplace catalog to ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCli(
            [
               'add',
               'marketplace',
               'https://github.com/my-org/marketplace',
               '--name',
               'team-market',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.marketplaces['team-market']).toBe('https://github.com/my-org/marketplace');
      });

      it('lists marketplaces in JSON format', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            marketplaces: {
               'team-market': 'https://github.com/my-org/marketplace',
            },
         });

         const { error, stdout } = await runCli(['list', 'marketplaces', '--config', configPath, '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.marketplaces['team-market']).toBe('https://github.com/my-org/marketplace');
      });

      it('removes a marketplace from ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            marketplaces: {
               'team-market': 'https://github.com/my-org/marketplace',
            },
         });

         const { error } = await runCli(
            ['remove', 'marketplace', 'team-market', '--yes', '--config', configPath, '--no-install'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.marketplaces['team-market']).toBeUndefined();
      });
   });

   describe('agent commands', () => {
      it('adds an agent to ai.json and infers name from file', async () => {
         const configPath = join(testDir, 'ai.json'),
               agentsDir = join(testDir, 'agents');

         await writeValidConfig(configPath);
         await mkdir(agentsDir, { recursive: true });
         await writeFile(
            join(agentsDir, 'reviewer.md'),
            `---
description: Code review assistant
mode: subagent
---
You are a senior code reviewer.
`,
         );

         const { error } = await runCli(
            [
               'add',
               'agent',
               './agents/reviewer.md',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.agents.reviewer).toBe('./agents/reviewer.md');
      });

      it('adds an agent with .agent.md extension and flag overrides', async () => {
         const configPath = join(testDir, 'ai.json'),
               agentsDir = join(testDir, 'agents');

         await writeValidConfig(configPath);
         await mkdir(agentsDir, { recursive: true });
         await writeFile(
            join(agentsDir, 'planner.agent.md'),
            `---
description: Task planner
---
You plan architecture tasks.
`,
         );

         const { error } = await runCli(
            [
               'add',
               'agent',
               './agents/planner.agent.md',
               '--mode',
               'primary',
               '--model',
               'claude-3-7-sonnet',
               '--tools',
               'bash,edit',
               '--config',
               configPath,
               '--no-install',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.agents.planner).toMatchObject({
            path: './agents/planner.agent.md',
            mode: 'primary',
            model: 'claude-3-7-sonnet',
            tools: ['bash', 'edit'],
         });
      });

      it('lists configured agents in JSON format', async () => {
         const configPath = join(testDir, 'ai.json'),
               agentsDir = join(testDir, 'agents');

         await mkdir(agentsDir, { recursive: true });
         await writeFile(join(agentsDir, 'reviewer.md'), 'You are a reviewer.');

         await writeValidConfig(configPath, {
            agents: {
               reviewer: './agents/reviewer.md',
            },
         });

         const { error, stdout } = await runCli(['list', 'agents', '--config', configPath, '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.agents.reviewer).toBe('./agents/reviewer.md');
      });

      it('removes an agent from ai.json', async () => {
         const configPath = join(testDir, 'ai.json'),
               agentsDir = join(testDir, 'agents');

         await mkdir(agentsDir, { recursive: true });
         await writeFile(join(agentsDir, 'reviewer.md'), 'You are a reviewer.');

         await writeValidConfig(configPath, {
            agents: {
               reviewer: './agents/reviewer.md',
            },
         });

         const { error } = await runCli(
            ['remove', 'agent', 'reviewer', '--yes', '--config', configPath, '--no-delete'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.agents.reviewer).toBeUndefined();
      });

      it('installs an agent directly using --type agent', async () => {
         const agentsDir = join(testDir, 'agents');

         process.env.HOME = join(testDir, 'fake-home');
         await mkdir(agentsDir, { recursive: true });
         await writeFile(
            join(agentsDir, 'debugger.md'),
            `---
description: Debugging assistant
mode: subagent
---
You debug issues.
`,
         );

         const { error } = await runCli(
            [
               'install',
               './agents/debugger.md',
               '--type',
               'agent',
               '--target',
               'claude-code',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         expect(existsSync(join(testDir, '.claude', 'agents', 'debugger.md'))).toBe(true);
      });
   });
});
