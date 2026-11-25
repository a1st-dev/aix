import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, realpath, symlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { listBackups, safeRm } from '@a1st/aix-core';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const testDirname = dirname(fileURLToPath(import.meta.url)),
      root = join(testDirname, '../..');
const maxBuffer = 1024 * 1024 * 10,
      binPath = join(root, 'dist', 'cli.js'),
      runShellCommand = promisify(exec);
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
      it('prints one JSON document when there is no config to validate', async () => {
         const { error, stdout } = await runCli(['validate', '--json']);

         expect(error).toBeDefined();
         expect(JSON.parse(stdout)).toEqual({ valid: false, error: 'No ai.json found. Run `aix init` to create one.' });
      });

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
               }),
               staleInstall = await runCli(['install', '--config', configPath, '--target', 'claude-code', '--dry-run']);

         expect(stale.error).toBeDefined();
         expect(staleInstall.stderr).toContain('aix validate --lock');

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
      it('installs inherited agents and runnable hooks without replacing user settings', async () => {
         const sourceDir = join(testDir, 'shared config'),
               settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json'),
               settings = {
                  model: 'existing-model',
                  permissions: { allow: ['Read'] },
                  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] },
               };

         await mkdir(join(sourceDir, 'agents'), { recursive: true });
         await mkdir(join(sourceDir, 'hooks'), { recursive: true });
         await mkdir(dirname(settingsPath), { recursive: true });
         await writeFile(settingsPath, JSON.stringify(settings));
         await writeFile(join(sourceDir, 'agents', 'review.md'), 'Review the changes.');
         await writeFile(join(sourceDir, 'hooks', 'check.mjs'), 'process.stdout.write(process.cwd());');
         await writeValidConfig(join(sourceDir, 'ai.json'), {
            agents: { review: './agents/review.md' },
            hooks: { agent_stop: [{ hooks: [{ command: 'node ./hooks/check.mjs' }] }] },
         });
         await writeValidConfig(join(testDir, 'ai.json'), { extends: './shared config/ai.json' });

         const installed = await runCli(['i', '-t', 'claude-code', '--user']),
               actualSettings = JSON.parse(await readFile(settingsPath, 'utf-8'));

         expect(installed.error).toBeUndefined();
         expect(installed.stdout + installed.stderr).toContain('Hooks');
         expect(actualSettings.model).toStrictEqual(settings.model);
         expect(actualSettings.permissions).toEqual(settings.permissions);
         expect(actualSettings.hooks.Stop).toHaveLength(2);
         expect(actualSettings.hooks.Stop[0]).toEqual(settings.hooks.Stop[0]);
         expect(actualSettings.hooks.Stop[1].hooks[0].command).toContain(join(sourceDir, 'hooks', 'check.mjs'));
         expect(existsSync(join(process.env.HOME ?? '', '.claude', 'agents', 'review.md'))).toStrictEqual(true);

         const shell = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'bin', 'bash.exe')
                  : '/bin/bash',
               hook = await runShellCommand(actualSettings.hooks.Stop[1].hooks[0].command, { cwd: testDir, shell }),
               backups = await listBackups(settingsPath),
               backupContents = await Promise.all(backups.map((backup) => {
                  return readFile(backup.path, 'utf-8');
               }));

         expect(await realpath(hook.stdout)).toStrictEqual(await realpath(testDir));
         expect(backups).toHaveLength(1);
         expect(backupContents).toEqual([JSON.stringify(settings)]);

         const repeated = await runCli(['i', '-t', 'claude-code', '--user']),
               repeatedSettings = JSON.parse(await readFile(settingsPath, 'utf-8'));

         expect(repeated.error).toBeUndefined();
         expect(repeatedSettings.hooks.Stop).toHaveLength(2);
      });

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

      it('refreshes the lockfile beside ai.json when --save changes that ai.json', async () => {
         const configPath = join(testDir, 'ai.json'),
               sourcePath = join(testDir, 'source', 'ai.json');

         await mkdir(dirname(sourcePath), { recursive: true });
         await writeValidConfig(configPath, { rules: { local: { content: 'Local rule.' } } });
         await writeValidConfig(sourcePath, { rules: { remote: { content: 'Remote rule.' } } });
         await runCli(['validate', '--config', configPath, '--lock']);

         const installed = await runCli(['install', sourcePath, '--save']),
               validated = await runCli(['validate', '--config', configPath]);

         expect(installed.error).toBeUndefined();
         expect(validated.error).toBeUndefined();
         expect(await readFile(configPath, 'utf-8')).toContain('remote');
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

      it('installs to a detected editor without writing it to ai.json', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await writeValidConfig(configPath, {
            rules: {
               local: { content: 'Local rule.' },
            },
         });

         const installed = await runCli(['install', '--project'], {
            root,
         });
         const localConfig = JSON.parse(await readFile(configPath, 'utf-8'));

         expect(installed.error).toBeUndefined();
         expect(localConfig.editors).toBeUndefined();
         expect(existsSync(join(testDir, '.claude/rules/local.md'))).toStrictEqual(true);
      });
   });

   describe('install without a terminal', () => {
      it('names the detected editors and how to choose between them, rather than prompting', async () => {
         const home = process.env.HOME ?? '';

         await mkdir(join(home, '.claude'), { recursive: true });
         await mkdir(join(home, '.codex'), { recursive: true });
         await writeValidConfig(join(testDir, 'ai.json'), { rules: { style: { content: 'Be brief.' } } });

         const installed = await runCli(['install', '--dry-run']);

         expect(installed.error).toBeDefined();
         expect(installed.stderr).toContain('claude-code, codex');
         expect(installed.stderr).toContain('--target');
         expect(installed.stderr).not.toContain('ExitPromptError');
      });
   });

   describe('small command fixes', () => {
      it('adds several agents in one command', async () => {
         await writeFile(join(testDir, 'reviewer.md'), 'Review the change.');
         await writeFile(join(testDir, 'planner.md'), 'Plan the change.');

         const added = await runCli(['add', 'agent', './reviewer.md', './planner.md', '--project', '--target', 'claude-code']);

         expect(added.error).toBeUndefined();
         expect(existsSync(join(testDir, '.claude', 'agents', 'reviewer.md'))).toStrictEqual(true);
         expect(existsSync(join(testDir, '.claude', 'agents', 'planner.md'))).toStrictEqual(true);
      });

      it('rejects scope flags that disagree', async () => {
         const installed = await runCli(['install', '--scope', 'project', '--user', '--dry-run']);

         expect(installed.error).toBeDefined();
         expect(installed.stderr).toContain('--user');
      });

      it('rejects a remove flag that does nothing without --save', async () => {
         const removed = await runCli(['remove', 'mcp', 'docs', '--yes', '--local', '--project', '--target', 'claude-code']);

         expect(removed.error).toBeDefined();
         expect(removed.stderr).toContain('--local requires --save');
      });

      it('says so when CI makes it skip a server that an editor only reads at user scope', async () => {
         const originalCI = process.env.CI;

         process.env.CI = 'true';

         const added = await runCli(['add', 'mcp', 'docs', '--command', 'node docs.js', '--target', 'codex']);

         if (originalCI === undefined) {
            delete process.env.CI;
         } else {
            process.env.CI = originalCI;
         }

         expect(added.stdout + added.stderr).toContain('CI environment detected');
         expect(existsSync(join(process.env.HOME ?? '', '.codex', 'config.toml'))).toStrictEqual(false);
      });

      it('clears the cache beside ai.json when run from a subdirectory', async () => {
         const cacheEntry = join(testDir, '.aix', '.tmp', 'cache', 'entry'),
               subdirectory = join(testDir, 'src');

         await writeValidConfig(join(testDir, 'ai.json'));
         await mkdir(dirname(cacheEntry), { recursive: true });
         await mkdir(subdirectory);
         await writeFile(cacheEntry, 'cached');
         process.chdir(subdirectory);

         const cleared = await runCli(['cache', 'clear']);

         expect(cleared.error).toBeUndefined();
         expect(existsSync(cacheEntry)).toStrictEqual(false);
      });

      it('says that there is nothing to remove instead of asking to confirm', async () => {
         const removed = await runCli(['remove', 'rule', 'missing', '--project', '--target', 'claude-code']);

         expect(removed.error).toBeUndefined();
         expect(removed.stdout).toContain('No rule named "missing" found at project scope in: claude-code');
      });

      it('backs up a hand-written skill directory before deleting it', async () => {
         const skillDir = join(testDir, '.claude', 'skills', 'pdf');

         await writeSkillDir(join(testDir, '.claude'), 'pdf');
         await writeFile(join(skillDir, 'notes.txt'), 'my notes');

         await runCli(['remove', 'skill', 'pdf', '--yes', '--project', '--target', 'claude-code']);

         const backups = await listBackups(skillDir);

         expect(existsSync(skillDir)).toStrictEqual(false);
         expect(backups).toHaveLength(1);
         expect(await readFile(join(backups[0]?.path ?? '', 'notes.txt'), 'utf-8')).toStrictEqual('my notes');
      });

      it('keeps the number of backups that aix.cache.maxBackups asks for', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { aix: { cache: { maxBackups: 1 } } });
         await runCli(['config', 'set', 'aix.cache.maxBackupAgeDays', '10']);
         await runCli(['config', 'set', 'aix.cache.maxBackupAgeDays', '20']);

         expect(await listBackups(configPath)).toHaveLength(1);
      });

      it('backs up a rule file before deleting it', async () => {
         const ruleFile = join(testDir, '.claude', 'rules', 'style.md');

         await mkdir(dirname(ruleFile), { recursive: true });
         await writeFile(ruleFile, 'Be brief.');

         await runCli(['remove', 'rule', 'style', '--yes', '--project', '--target', 'claude-code']);

         expect(existsSync(ruleFile)).toStrictEqual(false);
         expect(await listBackups(ruleFile)).toHaveLength(1);
      });

      it('backs up the ai.json that init --force replaces', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { rules: { style: { content: 'Be brief.' } } });

         await runCli(['init', '--force']);

         expect(await listBackups(configPath)).toHaveLength(1);
      });

      it('lists subcommands the way they are typed', async () => {
         const { stdout } = await runCli(['list', '--help']);

         expect(stdout).toContain('list skills');
         expect(stdout).not.toContain('list:skills');
         expect(stdout).not.toMatch(/list skills.*alias: ls/);
      });
   });

   describe('exit status', () => {
      it('is non-zero when an editor could not be installed to, after the others were', async () => {
         // Project-scope files, because aix leaves user-level config alone when it runs in CI.
         await writeFile(join(testDir, '.mcp.json'), '{ "mcpServers": ');
         await writeValidConfig(join(testDir, 'ai.json'), { mcp: { docs: { command: 'node', args: ['docs.js'] } } });

         const installed = await runCli(['install', '--project', '--target', 'claude-code', '--target', 'cursor']);

         expect(installed.error).toBeDefined();
         expect(installed.stdout + installed.stderr).toContain('Failed to install to claude-code');
         expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toStrictEqual(true);
      });
   });

   describe('add without an editor to install to', () => {
      it('says that nothing was installed', async () => {
         const added = await runCli(['add', 'mcp', 'docs', '--command', 'node docs.js']);

         expect(added.error).toBeUndefined();
         expect(added.stdout + added.stderr).toContain('Not installed to any editor');
      });

      it('fails an install, which would otherwise do nothing and exit 0', async () => {
         await writeValidConfig(join(testDir, 'ai.json'), { rules: { style: { content: 'Use direct language.' } } });

         const installed = await runCli(['install', '--project']);

         expect(installed.error).toBeDefined();
         expect(installed.stderr).toContain('No editors detected, so nothing was installed');
      });
   });

   describe('install scope', () => {
      const mcp = { docs: { command: 'node', args: ['docs.js'] } };

      it('installs into the project when ai.json declares project scope', async () => {
         await writeValidConfig(join(testDir, 'ai.json'), { scope: 'project', mcp });

         const installed = await runCli(['install', '--target', 'claude-code']);

         expect(installed.error).toBeUndefined();
         expect(installed.stdout).toContain('Installing to project scope');
         expect(existsSync(join(testDir, '.mcp.json'))).toStrictEqual(true);
         expect(existsSync(join(process.env.HOME ?? '', '.claude.json'))).toStrictEqual(false);
      });

      it('says that it writes to the home directory, and where, when it defaults to user scope', async () => {
         await writeValidConfig(join(testDir, 'ai.json'), { mcp });

         const installed = await runCli(['install', '--target', 'claude-code', '--dry-run']);

         expect(installed.stdout).toContain('Installing to user scope');
         expect(installed.stdout).toContain('Pass --project');
         expect(installed.stdout).toContain('~/.claude.json');
      });

      it('records the scope in ai.json when init is given one, so install follows it', async () => {
         await runCli(['init', '--project']);

         const withFlag = JSON.parse(await readFile(join(testDir, 'ai.json'), 'utf-8'));

         await runCli(['init', '--force']);

         const withoutFlag = JSON.parse(await readFile(join(testDir, 'ai.json'), 'utf-8'));

         expect(withFlag.scope).toStrictEqual('project');
         expect(withoutFlag.scope).toBeUndefined();
      });

      it('follows the scope ai.json declares when adding with --save', async () => {
         await writeValidConfig(join(testDir, 'ai.json'), { scope: 'project' });

         const added = await runCli(['add', 'mcp', 'docs', '--command', 'node docs.js', '--save', '--target', 'claude-code']);

         expect(added.error).toBeUndefined();
         expect(existsSync(join(testDir, '.mcp.json'))).toStrictEqual(true);
         expect(existsSync(join(process.env.HOME ?? '', '.claude.json'))).toStrictEqual(false);
      });

      it('leaves global-only editor config alone when adding or removing at project scope', async () => {
         const globalMcpPath = join(process.env.HOME ?? '', '.codeium', 'windsurf', 'mcp_config.json'),
               existing = JSON.stringify({ mcpServers: { docs: { command: 'node' } } });

         await mkdir(dirname(globalMcpPath), { recursive: true });
         await writeFile(globalMcpPath, existing);

         const added = await runCli(['add', 'mcp', 'other', '--command', 'node other.js', '--project', '--target', 'windsurf']),
               removed = await runCli(['remove', 'mcp', 'docs', '--yes', '--project', '--target', 'windsurf']);

         expect(added.error).toBeUndefined();
         expect(removed.error).toBeUndefined();
         expect(await readFile(globalMcpPath, 'utf-8')).toStrictEqual(existing);
      });

      it('leaves global-only editor config alone in a project-scope install', async () => {
         const globalMcpPath = join(process.env.HOME ?? '', '.codeium', 'windsurf', 'mcp_config.json'),
               existing = JSON.stringify({ mcpServers: { mine: { command: 'node' } } });

         await mkdir(dirname(globalMcpPath), { recursive: true });
         await writeFile(globalMcpPath, existing);
         await writeValidConfig(join(testDir, 'ai.json'), { mcp, rules: { style: { content: 'Be brief.' } } });

         const installed = await runCli(['install', '--target', 'windsurf', '--project']);

         expect(installed.error).toBeUndefined();
         expect(await readFile(globalMcpPath, 'utf-8')).toStrictEqual(existing);
         expect(installed.stdout + installed.stderr).toContain('did not write global-only config');
         expect(existsSync(join(testDir, '.windsurf', 'rules', 'style.md'))).toStrictEqual(true);
      });
   });

   describe('backups', () => {
      const original = JSON.stringify({ numStartups: 7, mcpServers: { mine: { command: 'node', args: ['mine.js'] } } }, null, 2);
      let claudeConfigPath: string;

      beforeEach(async () => {
         claudeConfigPath = join(process.env.HOME ?? '', '.claude.json');
         await writeFile(claudeConfigPath, original);
         await writeValidConfig(join(testDir, 'ai.json'), { mcp: { docs: { command: 'node', args: ['docs.js'] } } });
         await runCli(['install', '--target', 'claude-code', '--user']);
      });

      it('lists the backup of a user-level file from any directory and restores it', async () => {
         const listed = await runCli(['backups', '--json']),
               backups = JSON.parse(listed.stdout);

         expect(backups).toHaveLength(1);
         expect(backups[0].originalPath).toStrictEqual(claudeConfigPath);
         expect(await readFile(claudeConfigPath, 'utf-8')).toContain('docs');

         const restored = await runCli(['backups', 'restore', backups[0].path, '--yes']);

         expect(restored.error).toBeUndefined();
         expect(await readFile(claudeConfigPath, 'utf-8')).toStrictEqual(original);
      });

      it('survives clearing the cache from the home directory', async () => {
         process.chdir(process.env.HOME ?? '');
         await mkdir(join(process.cwd(), '.aix', '.tmp', 'cache'), { recursive: true });
         await writeFile(join(process.cwd(), '.aix', '.tmp', 'cache', 'entry'), 'cached');

         await runCli(['cache', 'clear']);

         expect(await listBackups(claudeConfigPath)).toHaveLength(1);
      });

      it('backs up an editor config before removing a server from it', async () => {
         const removed = await runCli(['remove', 'mcp', 'mine', '--yes', '--user', '--target', 'claude-code']),
               backups = await listBackups(claudeConfigPath),
               newest = await readFile(backups[0]?.path ?? '', 'utf-8');

         expect(removed.error).toBeUndefined();
         expect(backups).toHaveLength(2);
         expect(newest).toContain('"mine"');
         expect(await readFile(claudeConfigPath, 'utf-8')).not.toContain('"mine"');
      });
   });

   describe('install --clean', () => {
      it('clears the project cache and keeps skills, imported content, and the user config', async () => {
         const home = process.env.HOME ?? '',
               staleCacheEntry = join(testDir, '.aix', '.tmp', 'cache', 'rules', 'stale'),
               kept = [
                  join(home, '.aix', 'ai.json'),
                  join(home, '.aix', 'skills', 'other', 'SKILL.md'),
                  join(testDir, '.aix', 'imported', 'rules', 'imported.md'),
               ];

         await writeSkillDir(join(home, '.aix'), 'other');
         await mkdir(dirname(staleCacheEntry), { recursive: true });
         await mkdir(join(testDir, '.aix', 'imported', 'rules'), { recursive: true });
         await writeFile(staleCacheEntry, 'stale');
         await writeFile(join(home, '.aix', 'ai.json'), createValidConfig({ scope: 'user' }));
         await writeFile(join(testDir, '.aix', 'imported', 'rules', 'imported.md'), 'Imported rule.');
         await writeValidConfig(join(testDir, 'ai.json'), { rules: { imported: './.aix/imported/rules/imported.md' } });

         const installed = await runCli(['install', '--target', 'claude-code', '--clean']);

         expect(installed.error).toBeUndefined();
         expect(existsSync(staleCacheEntry)).toStrictEqual(false);
         expect(kept.filter(existsSync)).toEqual(kept);
      });
   });

   describe('install --overwrite', () => {
      it('is rejected without --save because it only replaces the saved ai.json', async () => {
         await writeValidConfig(join(testDir, 'ai.json'));

         const { error, stderr } = await runCli(['install', '--target', 'claude-code', '--project', '--overwrite']);

         expect(error).toBeDefined();
         expect(stderr).toContain('--save');
      });
   });

   describe('alternate user home', () => {
      it('installs user-scope config under --user-home and leaves the home directory alone', async () => {
         const userHome = join(testDir, 'alternate-home'),
               home = process.env.HOME ?? '';

         await writeValidConfig(join(testDir, 'ai.json'), {
            mcp: { docs: { command: 'node', args: ['docs.js'] } },
         });

         const installed = await runCli(['install', '--target', 'claude-code', '--user-home', userHome]),
               claudeConfig = JSON.parse(await readFile(join(userHome, '.claude.json'), 'utf-8'));

         expect(installed.error).toBeUndefined();
         expect(installed.stdout).toContain(`Using ${userHome} in place of your home directory`);
         expect(claudeConfig.mcpServers.docs.command).toStrictEqual('node');
         expect(existsSync(join(userHome, '.aix', 'state.json'))).toStrictEqual(true);
         expect(existsSync(join(home, '.claude.json'))).toStrictEqual(false);
         expect(existsSync(join(home, '.aix'))).toStrictEqual(false);
      });

      it('removes user-scope files from AIX_USER_HOME instead of the home directory', async () => {
         const userHome = join(testDir, 'alternate-home'),
               overriddenSkillDir = join(userHome, '.claude', 'skills', 'demo'),
               homeSkillDir = join(process.env.HOME ?? '', '.claude', 'skills', 'demo');

         await writeSkillDir(join(userHome, '.claude'), 'demo');
         await writeSkillDir(join(process.env.HOME ?? '', '.claude'), 'demo');
         vi.stubEnv('AIX_USER_HOME', userHome);

         const removed = await runCli(['remove', 'skill', 'demo', '--yes', '--target', 'claude-code']);

         expect(removed.error).toBeUndefined();
         expect(existsSync(overriddenSkillDir)).toStrictEqual(false);
         expect(existsSync(homeSkillDir)).toStrictEqual(true);
      });
   });

   describe('install state tracking', () => {
      it('reconciles changed hooks from the same ai.json and previews removal without writing', async () => {
         const configPath = join(testDir, 'ai.json'),
               settingsPath = join(testDir, '.claude', 'settings.json');

         await writeValidConfig(configPath, { hooks: {
            agent_stop: [{ hooks: [{ command: 'echo old' }] }],
            subagent_stop: [{ hooks: [{ command: 'echo subagent' }] }],
         } });
         const installed = await runCli(['install', '--config', configPath, '--target', 'claude-code', '--project']);

         expect(installed.error).toBeUndefined();

         await writeValidConfig(configPath, { hooks: { agent_stop: [{ hooks: [{ command: 'echo new' }] }] } });
         const before = await readFile(settingsPath, 'utf-8'),
               preview = await runCli(['install', '--config', configPath, '--target', 'claude-code', '--project', '--dry-run']);

         expect(preview.error).toBeUndefined();
         expect(await readFile(settingsPath, 'utf-8')).toBe(before);

         const updated = await runCli(['install', '--config', configPath, '--target', 'claude-code', '--project']),
               settings = JSON.parse(await readFile(settingsPath, 'utf-8')),
               state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(updated.error).toBeUndefined();
         expect(settings.hooks.Stop).toEqual([{ matcher: '', hooks: [{ type: 'command', command: 'echo new' }] }]);
         expect(settings.hooks.SubagentStop).toEqual([]);
         expect(Object.keys(state.installed.hooks)).toEqual(['agent_stop']);
         expect(state.installed.hooks.agent_stop.sources[configPath]).toEqual(['claude-code']);
      });

      it('preserves shared user hooks and inventory until the last contributing config removes them', async () => {
         const firstPath = join(testDir, 'first-ai.json'),
               secondPath = join(testDir, 'second-ai.json'),
               hooks = { agent_stop: [{ hooks: [{ command: 'echo shared' }] }] },
               settingsPath = join(process.env.HOME ?? '', '.claude', 'settings.json'),
               statePath = join(process.env.HOME ?? '', '.aix', 'state.json');

         await writeValidConfig(firstPath, { hooks });
         await writeValidConfig(secondPath, { hooks });
         const first = await runCli(['install', '--config', firstPath, '--target', 'claude-code', '--user']),
               second = await runCli(['install', '--config', secondPath, '--target', 'claude-code', '--user']);

         expect(first.error).toBeUndefined();
         expect(second.error).toBeUndefined();

         await writeValidConfig(firstPath);
         const firstRemoved = await runCli(['install', '--config', firstPath, '--target', 'claude-code', '--user']),
               sharedState = JSON.parse(await readFile(statePath, 'utf-8'));

         expect(firstRemoved.error).toBeUndefined();
         expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.Stop).toHaveLength(1);
         expect(sharedState.installed.hooks.agent_stop.sources).toEqual({ [secondPath]: ['claude-code'] });

         await writeValidConfig(secondPath);
         const secondRemoved = await runCli(['install', '--config', secondPath, '--target', 'claude-code', '--user']);

         expect(secondRemoved.error).toBeUndefined();
         expect(JSON.parse(await readFile(settingsPath, 'utf-8')).hooks.Stop).toEqual([]);
         expect(JSON.parse(await readFile(statePath, 'utf-8')).installed.hooks).toEqual({});
      });

      it('uninstalls a source contribution from editors that its ai.json no longer targets', async () => {
         const configPath = join(testDir, 'ai.json'),
               hooks = { agent_stop: [{ hooks: [{ command: 'echo managed' }] }] };

         await writeValidConfig(configPath, { editors: { 'claude-code': {}, cursor: {} }, hooks });
         const installed = await runCli(['install', '--config', configPath, '--project', '--only', 'hooks']);

         expect(installed.error).toBeUndefined();

         await writeValidConfig(configPath, { editors: { 'claude-code': {} }, hooks });
         const updated = await runCli(['install', '--config', configPath, '--project', '--only', 'hooks']),
               state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(updated.error).toBeUndefined();
         expect(JSON.parse(await readFile(join(testDir, '.cursor', 'hooks.json'), 'utf-8')).hooks.stop).toEqual([]);
         expect(state.installed.hooks.agent_stop.editors).toEqual(['claude-code']);

         await writeValidConfig(configPath, { editors: { 'claude-code': { enabled: false } }, hooks });
         const disabled = await runCli(['install', '--config', configPath, '--project', '--only', 'hooks']);

         expect(disabled.error).toBeUndefined();
         expect(JSON.parse(await readFile(join(testDir, '.claude', 'settings.json'), 'utf-8')).hooks.Stop).toEqual([]);
      });

      it('records every installed section so listings mark the items as aix-managed', async () => {
         const configPath = join(testDir, 'ai.json');

         process.env.HOME = join(testDir, 'fake-home');
         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
            rules: { style: { content: 'Be direct.' } },
            hooks: { pre_command: [ { hooks: [ { command: './lint.sh' } ] } ] },
         });

         const { error } = await runCli(['install', '--config', configPath, '--project'], { root });

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
         await runCli(['install', '--config', configPath, '--project'], { root });

         await writeValidConfig(configPath, {
            editors: { 'claude-code': {} },
            mcp: { demo: { command: 'npx demo' } },
         });
         await runCli(['install', '--config', configPath, '--project'], { root });

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
         await runCli(['install', '--config', configPath, '--project'], { root });
         await runCli(['install', '--only', 'mcp', '--config', configPath, '--project'], { root });

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
         await runCli(['install', '--config', configPath, '--project'], { root });
         await writeFile(mcpPath, JSON.stringify({ command: 'npx other' }));

         const { error } = await runCli(
            ['install', mcpPath, '--type', 'mcp', '--name', 'other', '--target', 'claude-code', '--project'],
            { root },
         );

         expect(error).toBeUndefined();

         const state = JSON.parse(await readFile(join(testDir, '.aix', 'state.json'), 'utf-8'));

         expect(Object.keys(state.installed.mcp).toSorted()).toEqual(['demo', 'other']);
      });
   });

   describe('add without --save', () => {
      it('keeps what an earlier add and an earlier install put in the same editor config', async () => {
         const mcpPath = join(testDir, '.mcp.json');

         await writeValidConfig(join(testDir, 'ai.json'), {
            mcp: { fromconfig: { command: 'node', args: ['config.js'] } },
         });
         await runCli(['install', '--project', '--target', 'claude-code']);
         await runCli(['add', 'mcp', 'alpha', '--command', 'node alpha.js', '--project', '--target', 'claude-code']);

         const second = await runCli(['add', 'mcp', 'beta', '--command', 'node beta.js', '--project', '--target', 'claude-code']),
               servers = JSON.parse(await readFile(mcpPath, 'utf-8')).mcpServers;

         expect(second.error).toBeUndefined();
         expect(Object.keys(servers).toSorted()).toEqual(['alpha', 'beta', 'fromconfig']);
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
               '--save',
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
         expect(stdout).toContain('PreToolUse');
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
               '--save',
               '--config-only',
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
               '--save',
               '--config-only',
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
               '--save',
               '--config-only',
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
               '--save',
               '--config-only',
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
               '--save',
               '--project',
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
               '--save',
               '--config-only',
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
            ['add', 'hook', './hooks/guard.json', '--config', configPath, '--save', '--config-only'],
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
               '--save',
               '--project',
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
            ['add', 'hook', 'post_compact', '--command', './cleanup.sh', '--config', configPath, '--save', '--config-only'],
            { root },
         );

         const config = JSON.parse(await readFile(configPath, 'utf-8'));

         config.hooks.post_compact[0].hooks[0].async = true;
         config.hooks.post_compact[0].hooks[0].powershell = 'Write-Host cleanup';
         await writeFile(configPath, JSON.stringify(config, null, 2));

         const { error } = await runCli(
            ['install', '--config', configPath, '--target', 'codex', '--project'],
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
         const fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;
         await runCli(
            ['add', 'hook', 'pre_file_write', '--matcher', 'Write|Edit', '--command', './scripts/guard.sh', '--target', 'claude-code'],
            { root },
         );

         const { error, stdout } = await runCli(['list', 'hooks', '--target', 'claude-code'], { root });

         expect(error).toBeUndefined();
         expect(stdout).toContain('pre_file_write -> ./scripts/guard.sh');
         expect(stdout).toContain('claude-code');
      });

      it('lists multiple hooks associated with the same hook type as separate rows', async () => {
         const fakeHome = join(testDir, 'fake-home-multi'),
               hookFile = join(testDir, 'hooks.json');

         process.env.HOME = fakeHome;
         await writeFile(
            hookFile,
            JSON.stringify({
               hooks: {
                  pre_command: [
                     {
                        hooks: [
                           { command: 'npm run lint' },
                           { command: 'npm test' },
                        ],
                     },
                  ],
               },
            }),
         );
         await runCli(
            [ 'add', 'hook', hookFile, '--target', 'claude-code' ],
            { root },
         );

         const { error, stdout } = await runCli([ 'list', 'hooks', '--target', 'claude-code' ], { root });

         expect(error).toBeUndefined();
         expect(stdout).toContain('pre_command -> npm run lint');
         expect(stdout).toContain('pre_command -> npm test');
         expect(stdout).toContain('claude-code 2 items');
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
               '--save',
               '--project',
            ],
            { root },
         );

         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'claude-code', '--config', configPath, '--save', '--project'],
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
               '--save',
               '--project',
            ],
            { root },
         );

         // No --target here: the removal has to learn the editor set from state, the way
         // a user who just runs `aix remove hook <event>` would.
         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--config', configPath, '--save', '--project'],
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
            ['install', '--target', 'claude-code', '--config', configPath, '--project'],
            { root },
         );

         const { error } = await runCli(
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'claude-code', '--project'],
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
            ['remove', 'hook', 'pre_command', '--yes', '--target', 'zed', '--project'],
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
               '--save',
               '--project',
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
            ['add', 'skill', './skills/locked-skill', '--config', configPath, '--save', '--lock'],
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

         await runCli(['add', 'skill', 'typescript', '--config', configPath, '--save'], {
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

         await runCli(['add', 'skill', './skills/custom', '--config', configPath, '--save'], {
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
            ['add', 'skill', './skills/directory-skill/SKILL.md', '--config', configPath, '--save'],
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
               '--save',
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
               '--save',
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
               '--save',
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

      it('installs to project scope only when requested', async () => {
         const configPath = join(testDir, 'ai.json'),
               fakeHome = join(testDir, 'fake-home');

         process.env.HOME = fakeHome;

         await writeValidConfig(configPath, {
            editors: ['copilot'],
         });
         await writeSkillDir(testDir, 'project-default');

         await runCli(['add', 'skill', './skills/project-default', '--config', configPath, '--save', '--project'], {
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
               '--save',
               '--config-only',
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
               '--save',
               '--config-only',
            ],
            { root },
         );

         expect(error).toBeDefined();
         expect(stderr).toContain('These flags can only be used with one source: --name');
      });
   });

   describe('remove skill', () => {
      it.each([ '..', '.', '../rules' ])('deletes nothing when asked to remove the path-like name "%s"', async (name) => {
         const claudeDir = join(testDir, '.claude');

         await writeSkillDir(claudeDir, 'keep');
         await mkdir(join(claudeDir, 'rules'), { recursive: true });
         await writeFile(join(claudeDir, 'settings.json'), '{}');
         await writeSkillDir(join(testDir, '.aix'), 'keep');

         const { error } = await runCli(['remove', 'skill', name, '--yes', '--project', '--target', 'claude-code']);

         expect(error).toBeUndefined();
         expect(existsSync(join(claudeDir, 'settings.json'))).toStrictEqual(true);
         expect(existsSync(join(claudeDir, 'rules'))).toStrictEqual(true);
         expect(existsSync(join(claudeDir, 'skills', 'keep', 'SKILL.md'))).toStrictEqual(true);
         expect(existsSync(join(testDir, '.aix', 'skills', 'keep', 'SKILL.md'))).toStrictEqual(true);
      });

      it('keeps the shared skill copy while another editor still links to it', async () => {
         const sharedCopy = join(testDir, '.aix', 'skills', 'demo'),
               claudeLink = join(testDir, '.claude', 'skills', 'demo'),
               cursorLink = join(testDir, '.cursor', 'skills', 'demo'),
               statePath = join(testDir, '.aix', 'state.json'),
               installed = { installedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', editors: ['claude-code', 'cursor'] };

         await writeSkillDir(join(testDir, '.aix'), 'demo');
         await mkdir(dirname(claudeLink), { recursive: true });
         await mkdir(dirname(cursorLink), { recursive: true });
         await symlink(join('..', '..', '.aix', 'skills', 'demo'), claudeLink);
         await symlink(join('..', '..', '.aix', 'skills', 'demo'), cursorLink);
         await writeFile(statePath, JSON.stringify({ version: 1, scope: 'project', installed: { skills: { demo: installed } } }));

         const { error } = await runCli(['remove', 'skill', 'demo', '--yes', '--project', '--target', 'cursor']),
               state = JSON.parse(await readFile(statePath, 'utf-8'));

         expect(error).toBeUndefined();
         expect(existsSync(cursorLink)).toStrictEqual(false);
         expect(existsSync(join(claudeLink, 'SKILL.md'))).toStrictEqual(true);
         expect(existsSync(sharedCopy)).toStrictEqual(true);
         expect(state.installed.skills.demo.editors).toEqual(['claude-code']);
      });

      it('explains how to confirm when there is no terminal to prompt on', async () => {
         await writeSkillDir(join(testDir, '.claude'), 'demo');

         const { error, stderr } = await runCli(['remove', 'skill', 'demo', '--project', '--target', 'claude-code']);

         expect(error).toBeDefined();
         expect(stderr).toContain('Pass --yes to confirm');
         expect(stderr).not.toContain('ExitPromptError');
         expect(existsSync(join(testDir, '.claude', 'skills', 'demo', 'SKILL.md'))).toStrictEqual(true);
      });

      it('removes a skill from config', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*' } });

         await runCli(['remove', 'skill', 'typescript', '--yes', '--config', configPath, '--save'], {
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

         await runCli(['remove', 'skill', 'demo-skill', '--yes', '--config', configPath, '--save', '--project'], {
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

         await runCli(['remove', 'skill', 'react:components', '--yes', '--config', configPath, '--save'], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['react-components']).toBeUndefined();
      });
   });

   describe('remove rule', () => {
      it('deletes a Copilot rule, whose file name carries the .instructions.md suffix', async () => {
         const installedRuleFile = join(testDir, '.github', 'instructions', 'coding.instructions.md');

         await mkdir(dirname(installedRuleFile), { recursive: true });
         await writeFile(installedRuleFile, 'Keep functions small.');

         const { error } = await runCli(['remove', 'rule', 'coding', '--yes', '--project', '--target', 'copilot']);

         expect(error).toBeUndefined();
         expect(existsSync(installedRuleFile)).toStrictEqual(false);
      });

      it('removes a rule from config and deletes the installed rule file from editors', async () => {
         const configPath = join(testDir, 'ai.json'),
               rulesDir = join(testDir, 'rules'),
               editorRuleDir = join(testDir, '.claude', 'rules'),
               ruleFile = join(rulesDir, 'coding.md'),
               installedRuleFile = join(editorRuleDir, 'coding.md');

         await mkdir(rulesDir, { recursive: true });
         await mkdir(editorRuleDir, { recursive: true });
         await writeFile(ruleFile, 'Keep functions small.');
         await writeFile(installedRuleFile, 'Keep functions small.');
         await writeValidConfig(configPath, {
            rules: {
               coding: './rules/coding.md',
            },
            editors: ['claude-code'],
         });

         const { error, stdout } = await runCli(
            ['remove', 'rule', 'coding', '--yes', '--config', configPath, '--save', '--project'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.rules.coding).toBeUndefined();
         expect(existsSync(installedRuleFile)).toBe(false);
         expect(stdout).toContain('Items to remove:');
         expect(stdout).toContain('claude-code');
         expect(stdout).toContain(installedRuleFile);
      });

      it('refreshes existing lockfile when rule is removed', async () => {
         const configPath = join(testDir, 'ai.json'),
               rulesDir = join(testDir, 'rules'),
               ruleFile = join(rulesDir, 'style.md');

         await mkdir(rulesDir, { recursive: true });
         await writeFile(ruleFile, 'Follow camelCase.');
         await writeValidConfig(configPath, {
            rules: {
               style: './rules/style.md',
            },
         });

         // Create initial lockfile
         await runCli(['validate', '--config', configPath, '--lock'], { root });
         expect(existsSync(join(testDir, 'ai.lock.json'))).toBe(true);

         const initialLock = JSON.parse(await readFile(join(testDir, 'ai.lock.json'), 'utf-8'));

         // Remove rule, lockfile should auto-refresh
         const { error } = await runCli(
            ['remove', 'rule', 'style', '--yes', '--config', configPath, '--save'],
            { root },
         );

         expect(error).toBeUndefined();
         const updatedLock = JSON.parse(await readFile(join(testDir, 'ai.lock.json'), 'utf-8'));

         expect(updatedLock.config.digest).not.toBe(initialLock.config.digest);
      });
   });

   describe('remove prompt', () => {
      it('accepts --no-delete as another spelling of --config-only', async () => {
         const configPath = join(testDir, 'ai.json'),
               promptsDir = join(testDir, 'prompts'),
               promptFile = join(promptsDir, 'review.md');

         await mkdir(promptsDir, { recursive: true });
         await writeFile(promptFile, 'Review this PR.');
         await writeValidConfig(configPath, {
            prompts: {
               review: './prompts/review.md',
            },
         });

         const { error } = await runCli(
            ['remove', 'prompt', 'review', '--yes', '--config', configPath, '--save', '--no-delete'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.prompts.review).toBeUndefined();
         expect(existsSync(promptFile)).toBe(true);
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

         expect(parsed.items.find((item: Record<string, unknown>) => item.name === 'copilot-skill')).toMatchObject({
            editor: 'copilot',
            type: 'skill',
            source: 'external',
            scope: 'project',
         });
         expect(parsed.items.find((item: Record<string, unknown>) => item.name === 'copilot-skill').path).toContain(
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

         expect(parsed.targets).toEqual(['windsurf']);
         expect(parsed.items.find((item: Record<string, unknown>) => item.name === 'devin-skill')).toMatchObject({
            editor: 'windsurf',
            type: 'skill',
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

         expect(parsed.items.find((item: Record<string, unknown>) => item.name === 'user-copilot-skill')).toMatchObject({
            editor: 'copilot',
            type: 'skill',
            source: 'external',
            scope: 'user',
         });
         expect(parsed.items.find((item: Record<string, unknown>) => item.name === 'user-copilot-skill').path).toContain(
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

         expect(parsed.items.find((item: Record<string, unknown>) => {
            return item.editor === 'opencode' && item.name === 'user-claude-skill';
         })).toMatchObject({
            editor: 'opencode',
            type: 'skill',
            source: 'external',
            scope: 'user',
         });
         expect(parsed.items.find((item: Record<string, unknown>) => {
            return item.editor === 'opencode' && item.name === 'user-claude-skill';
         }).path).toContain(
            '.claude/skills/user-claude-skill',
         );
         expect(parsed.items.find((item: Record<string, unknown>) => {
            return item.editor === 'opencode' && item.name === 'user-agents-skill';
         })).toMatchObject({
            editor: 'opencode',
            type: 'skill',
            source: 'external',
            scope: 'user',
         });
         expect(parsed.items.find((item: Record<string, unknown>) => {
            return item.editor === 'opencode' && item.name === 'user-agents-skill';
         }).path).toContain(
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

      it('aliases cache.* keys to aix.cache.* in config set and get', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const setResult = await runCli(
            ['config', 'set', 'cache.maxCacheAgeDays', '14', '--config', configPath],
            { root },
         );

         expect(setResult.error).toBeUndefined();

         const getResult = await runCli(
            ['config', 'get', 'cache.maxCacheAgeDays', '--config', configPath],
            { root },
         );

         expect(getResult.error).toBeUndefined();
         expect(getResult.stdout.trim()).toBe('14');
      });
   });

   describe('list editors', () => {
      it('lists editors with native user configuration without requiring ai.json', async () => {
         const fakeHome = join(testDir, 'home'),
               skillDir = join(fakeHome, '.claude', 'skills', 'review');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(join(skillDir, 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\n');

         const { error, stdout } = await runCli(['list', 'editors', '--target', 'claude-code'], { root });

         expect(error).toBeUndefined();
         expect(stdout.trim()).toBe('claude-code');
         expect(stdout).not.toContain('type');
         expect(stdout).not.toContain('editor');
      });

      it('does not include editor rows in the full inventory', async () => {
         const fakeHome = join(testDir, 'home'),
               skillDir = join(fakeHome, '.claude', 'skills', 'review');

         process.env.HOME = fakeHome;
         await mkdir(skillDir, { recursive: true });
         await writeFile(join(skillDir, 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\n');

         const { error, stdout } = await runCli(['list', '--target', 'claude-code', '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.items.some((item: Record<string, unknown>) => item.type === 'editor')).toStrictEqual(false);
      });
   });

   describe('plugins commands', () => {
      it('adds a plugin to ai.json with shorthand', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCli(
            ['add', 'plugin', 'code-review@claude-plugins-official', '--config', configPath, '--save', '--config-only'],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.plugins['code-review@claude-plugins-official']).toEqual(true);
      });

      it('lists plugins in JSON format', async () => {
         const fakeHome = join(testDir, 'home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await writeFile(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({
            enabledPlugins: {
               'code-review': true,
               '@scope/helper': { enabled: true, source: './plugins/helper' },
            },
         }));

         const { error, stdout } = await runCli(['list', 'plugins', '--target', 'claude-code', '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.items.map((item: Record<string, unknown>) => item.name)).toEqual([
            '@scope/helper',
            'code-review',
         ]);
      });

      it('removes a plugin from ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            plugins: {
               'code-review': true,
            },
         });

         const { error } = await runCli(
            ['remove', 'plugin', 'code-review', '--yes', '--config', configPath, '--save', '--config-only'],
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
               '--save',
               '--config-only',
            ],
            { root },
         );

         expect(error).toBeUndefined();
         const content = await readFile(configPath, 'utf-8'),
               config = JSON.parse(content);

         expect(config.marketplaces['team-market']).toBe('https://github.com/my-org/marketplace');
      });

      it('lists marketplaces in JSON format', async () => {
         const fakeHome = join(testDir, 'home');

         process.env.HOME = fakeHome;
         await mkdir(join(fakeHome, '.claude'), { recursive: true });
         await writeFile(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({
            extraKnownMarketplaces: {
               'team-market': { source: { source: 'github', repo: 'my-org/marketplace' } },
            },
         }));

         const { error, stdout } = await runCli(['list', 'marketplaces', '--target', 'claude-code', '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.items).toContainEqual(expect.objectContaining({
            editor: 'claude-code',
            type: 'marketplace',
            name: 'team-market',
         }));
      });

      it('removes a marketplace from ai.json', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            marketplaces: {
               'team-market': 'https://github.com/my-org/marketplace',
            },
         });

         const { error } = await runCli(
            ['remove', 'marketplace', 'team-market', '--yes', '--config', configPath, '--save', '--config-only'],
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
               '--save',
               '--config-only',
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
               '--save',
               '--config-only',
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
         const fakeHome = join(testDir, 'home'),
               agentsDir = join(fakeHome, '.claude', 'agents');

         process.env.HOME = fakeHome;
         await mkdir(agentsDir, { recursive: true });
         await writeFile(join(agentsDir, 'reviewer.md'), 'You are a reviewer.');

         const { error, stdout } = await runCli(['list', 'agents', '--target', 'claude-code', '--json'], { root });

         expect(error).toBeUndefined();
         const parsed = JSON.parse(stdout);

         expect(parsed.items).toContainEqual(expect.objectContaining({
            editor: 'claude-code',
            type: 'agent',
            name: 'reviewer',
         }));
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
            ['remove', 'agent', 'reviewer', '--yes', '--config', configPath, '--save', '--config-only'],
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

      it('runs topic index commands without unparsed command warnings in development', async () => {
         const topics = [ 'add', 'remove', 'cache', 'config' ],
               results = await Promise.all(
                  topics.map((topic) => {
                     return new Promise<{ topic: string; result: CommandResult }>((resolve) => {
                        execFile(
                           'node',
                           [ binPath, topic ],
                           {
                              cwd: testDir,
                              env: {
                                 ...process.env,
                                 NODE_ENV: 'development',
                              },
                           },
                           (error, stdout, stderr) => {
                              resolve({
                                 topic,
                                 result: {
                                    error: error ?? undefined,
                                    stdout,
                                    stderr,
                                 },
                              });
                           },
                        );
                     });
                  }),
               );

         for (const { topic, result } of results) {
            expect(result.error).toBeUndefined();
            expect(result.stderr).not.toContain('UnparsedCommand');
            expect(result.stderr).not.toContain("Did you forget to call 'this.parse'?");
            expect(result.stdout).toContain(`aix ${topic}`);
         }
      });
   });
});
