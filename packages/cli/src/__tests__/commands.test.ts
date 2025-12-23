import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { safeRm } from '@a1st/aix-core';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCommand } from '@oclif/test';

const __dirname = dirname(fileURLToPath(import.meta.url)),
      root = join(__dirname, '../..');

/**
 * Helper to create a valid ai.json config
 */
function createValidConfig(overrides: Record<string, unknown> = {}): string {
   return JSON.stringify({
      $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
      ...overrides,
   });
}

/**
 * Helper to write a valid config file
 */
async function writeValidConfig(path: string, overrides: Record<string, unknown> = {}): Promise<void> {
   await writeFile(path, createValidConfig(overrides));
}

/**
 * Create a unique test directory for each test
 */
function createTestDir(): string {
   return join(tmpdir(), `aix-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('CLI Commands', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = createTestDir();
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   // Note: init command uses process.cwd(), not --config flag, so we skip init tests here
   // The init command is tested manually and via the basic CLI tests

   describe('validate', () => {
      it('validates a correct config file', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         // Spinner output goes to stderr, so check there
         const { stderr } = await runCommand(['validate', '--config', configPath], { root });

         expect(stderr).toContain('valid');
      });

      it('reports error when no config found', async () => {
         const configPath = join(testDir, 'nonexistent.json');
         const { error } = await runCommand(['validate', '--config', configPath], { root });

         expect(error).toBeDefined();
      });

      it('outputs JSON when --json flag is used', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(['validate', '--config', configPath, '--json'], {
            root,
         });
         const result = JSON.parse(stdout);

         expect(result.valid).toBe(true);
      });
   });

   describe('list', () => {
      it('lists all configured items', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*' } });

         const { stdout } = await runCommand(['list', '--config', configPath], { root });

         expect(stdout).toContain('Skills');
         expect(stdout).toContain('typescript');
      });

      it('filters by scope', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            skills: { typescript: '*' },
            mcp: { github: { command: 'test' } },
         });

         const { stdout } = await runCommand(['list', '--config', configPath, '--scope', 'skills'], {
            root,
         });

         expect(stdout).toContain('Skills');
         expect(stdout).toContain('typescript');
         expect(stdout).not.toContain('MCP Servers');
      });

      it('outputs JSON when --json flag is used', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*' } });

         const { stdout } = await runCommand(['list', '--config', configPath, '--json'], { root });
         const result = JSON.parse(stdout);

         expect(result.skills).toEqual({ typescript: '*' });
      });
   });

   describe('add skill', () => {
      it('adds an npm skill by short name (convention: aix-skill-*)', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(['add', 'skill', 'typescript', '--config', configPath], {
            root,
         });

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBe('aix-skill-typescript');
      });

      it('adds a skill with local path and infers name', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['add', 'skill', './skills/custom', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.custom).toEqual({ path: './skills/custom' });
      });

      it('adds a skill from GitHub tree URL and infers name/ref/path', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            [
               'add',
               'skill',
               'https://github.com/anthropics/skills/tree/main/skills/pdf',
               '--config',
               configPath,
            ],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.pdf).toEqual({
            git: 'https://github.com/anthropics/skills',
            ref: 'main',
            path: 'skills/pdf',
         });
      });

      it('adds a skill from GitHub repo URL', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['add', 'skill', 'https://github.com/a1st/aix-skill-react', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['aix-skill-react']).toEqual({
            git: 'https://github.com/a1st/aix-skill-react',
         });
      });

      it('adds a skill from git shorthand with ref', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['add', 'skill', 'github:a1st/aix-skill-vue#v2.0.0', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills['aix-skill-vue']).toEqual({
            git: 'https://github.com/a1st/aix-skill-vue',
            ref: 'v2.0.0',
         });
      });

      it('allows overriding inferred name with --name', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['add', 'skill', '@a1st/aix-skill-react', '--name', 'react', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.react).toBe('@a1st/aix-skill-react');
      });

      it('allows overriding git ref with --ref', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            [
               'add',
               'skill',
               'https://github.com/anthropics/skills/tree/main/skills/pdf',
               '--ref',
               'develop',
               '--config',
               configPath,
            ],
            { root },
         );

         expect(stdout).toContain('Added skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.pdf).toEqual({
            git: 'https://github.com/anthropics/skills',
            ref: 'develop',
            path: 'skills/pdf',
         });
      });
   });

   describe('add mcp', () => {
      it('adds an MCP server with stdio transport', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         // Note: command value without spaces to avoid oclif/test argument parsing issues
         await runCommand(['add', 'mcp', 'github', '--command', 'npx', '--config', configPath], {
            root,
         });

         // Verify the config was updated correctly
         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.mcp.github.command).toBe('npx');
      });

      it('adds an MCP server with http transport', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCommand(
            ['add', 'mcp', 'custom', '--url', 'http://localhost:3000/mcp', '--config', configPath],
            { root },
         );

         // Verify the config was updated correctly
         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.mcp.custom.url).toBe('http://localhost:3000/mcp');
      });

      it('fails when neither --command nor --url is provided and server not found in registry', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         // Mock fetch to return empty results from MCP registry
         const originalFetch = globalThis.fetch;

         globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ servers: [], metadata: {} }),
         });

         try {
            const { error } = await runCommand(
               ['add', 'mcp', 'nonexistent-server', '--config', configPath],
               { root },
            );

            expect(error?.message).toContain('No MCP servers found');
         } finally {
            globalThis.fetch = originalFetch;
         }
      });
   });

   describe('remove skill', () => {
      it('removes a skill from config', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*', react: '^1.0.0' } });

         const { stdout } = await runCommand(
            ['remove', 'skill', 'typescript', '--yes', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Removed skill');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBeUndefined();
         expect(config.skills.react).toBe('^1.0.0');
      });

      it('fails when skill does not exist', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCommand(
            ['remove', 'skill', 'nonexistent', '--yes', '--config', configPath],
            { root },
         );

         expect(error?.message).toContain('not found');
      });
   });

   describe('remove mcp', () => {
      it('removes an MCP server from config', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            mcp: {
               github: { command: 'test' },
               other: { command: 'other' },
            },
         });

         await runCommand(['remove', 'mcp', 'github', '--yes', '--config', configPath], { root });

         // Verify the config was updated correctly
         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.mcp.github).toBeUndefined();
         expect(config.mcp.other).toBeDefined();
      });
   });

   describe('config get', () => {
      it('gets a top-level config value', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, { skills: { typescript: '*' } });

         const { stdout } = await runCommand(['config', 'get', 'skills', '--config', configPath], {
            root,
         });

         expect(stdout).toContain('typescript');
      });

      it('gets a nested config value', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            rules: { typescript: { content: 'Use TypeScript' } },
         });

         const { stdout } = await runCommand(['config', 'get', 'rules', '--config', configPath], {
            root,
         });

         expect(stdout).toContain('Use TypeScript');
      });

      it('fails when key does not exist', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCommand(['config', 'get', 'nonexistent', '--config', configPath], {
            root,
         });

         expect(error?.message).toContain('not found');
      });
   });

   describe('config set', () => {
      it('sets a config value', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['config', 'set', 'skills.typescript', '"^1.0.0"', '--config', configPath],
            { root },
         );

         expect(stdout).toContain('Set skills.typescript');

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.typescript).toBe('^1.0.0');
      });

      it('sets a nested config value with JSON', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         // Note: JSON value without spaces to avoid oclif/test argument parsing issues
         await runCommand(
            [
               'config',
               'set',
               'rules',
               '{"typescript":{"content":"TypeScript"}}',
               '--config',
               configPath,
            ],
            { root },
         );

         // Verify the config was updated correctly
         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.rules).toEqual({ typescript: { content: 'TypeScript' } });
      });
   });

   describe('install', () => {
      it('shows dry-run preview', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            skills: { typescript: '*' },
            mcp: { github: { command: 'test' } },
            rules: { typescript: { content: 'Use TypeScript' } },
         });

         // Spinner output goes to stderr
         const { stderr } = await runCommand(
            ['install', '--dry-run', '--target', 'windsurf', '--config', configPath],
            { root },
         );

         expect(stderr).toContain('windsurf');
      });

      it('respects --scope flag in dry-run', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath, {
            skills: { typescript: '*' },
            mcp: { github: { command: 'test' } },
            rules: { typescript: { content: 'Use TypeScript' } },
         });

         const { stdout } = await runCommand(
            ['install', '--dry-run', '--target', 'windsurf', '--scope', 'mcp', '--config', configPath],
            { root },
         );

         // Should show MCP section, not rules
         expect(stdout).toContain('MCP');
         expect(stdout).not.toContain('rules/');
      });

      it('outputs JSON when --json flag is used', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { stdout } = await runCommand(
            ['install', '--dry-run', '--target', 'windsurf', '--json', '--config', configPath],
            { root },
         );
         const result = JSON.parse(stdout);

         expect(result.dryRun).toBe(true);
         expect(result.results).toBeDefined();
      });
   });

   describe('install --save', () => {
      it('creates new ai.json when --save is used without existing file', async () => {
         // Create a "remote" config file to use as source
         const remoteConfigPath = join(testDir, 'remote-ai.json');

         await writeValidConfig(remoteConfigPath, {
            mcp: { playwright: { command: 'npx' } },
            rules: { 'remote-rule': { content: 'remote rule' } },
         });

         // Ensure no local ai.json exists
         const localConfigPath = join(testDir, 'ai.json');

         await rm(localConfigPath, { force: true });

         // Run install --save from testDir
         process.chdir(testDir);
         await runCommand(['install', remoteConfigPath, '--save'], { root });

         // Verify the file was created with remote content
         const content = await readFile(localConfigPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.mcp.playwright).toBeDefined();
         expect(Object.keys(config.rules)).toHaveLength(1);
      });

      it('merges into existing ai.json (remote wins)', async () => {
         // Create local config
         const localConfigPath = join(testDir, 'ai.json');

         await writeValidConfig(localConfigPath, {
            mcp: { local: { command: 'local-cmd' } },
            rules: { 'local-rule': { content: 'local rule' } },
         });

         // Create remote config
         const remoteConfigPath = join(testDir, 'remote-ai.json');

         await writeValidConfig(remoteConfigPath, {
            mcp: { remote: { command: 'remote-cmd' } },
            rules: { 'remote-rule': { content: 'remote rule' } },
         });

         // Run install --save (not dry-run) from testDir
         process.chdir(testDir);
         await runCommand(['install', remoteConfigPath, '--save'], { root });

         // Verify merged config
         const content = await readFile(localConfigPath, 'utf-8');
         const config = JSON.parse(content);

         // Both MCP servers should exist
         expect(config.mcp.local).toBeDefined();
         expect(config.mcp.remote).toBeDefined();

         // Rules should be merged (both keys exist)
         expect(Object.keys(config.rules)).toHaveLength(2);
      });

      it('overwrites existing ai.json with --overwrite', async () => {
         // Create local config
         const localConfigPath = join(testDir, 'ai.json');

         await writeValidConfig(localConfigPath, {
            mcp: { local: { command: 'local-cmd' } },
            rules: { 'local-rule': { content: 'local rule' } },
         });

         // Create remote config
         const remoteConfigPath = join(testDir, 'remote-ai.json');

         await writeValidConfig(remoteConfigPath, {
            mcp: { remote: { command: 'remote-cmd' } },
         });

         // Run install --save --overwrite from testDir
         process.chdir(testDir);
         await runCommand(['install', remoteConfigPath, '--save', '--overwrite'], { root });

         // Verify overwritten config
         const content = await readFile(localConfigPath, 'utf-8');
         const config = JSON.parse(content);

         // Only remote MCP server should exist
         expect(config.mcp.local).toBeUndefined();
         expect(config.mcp.remote).toBeDefined();
      });

      it('filters by --scope when saving', async () => {
         // Create local config
         const localConfigPath = join(testDir, 'ai.json');

         await writeValidConfig(localConfigPath, {
            mcp: { local: { command: 'local-cmd' } },
            rules: { 'local-rule': { content: 'local rule' } },
         });

         // Create remote config with multiple sections
         const remoteConfigPath = join(testDir, 'remote-ai.json');

         await writeValidConfig(remoteConfigPath, {
            mcp: { remote: { command: 'remote-cmd' } },
            rules: { 'remote-rule': { content: 'remote rule' } },
            skills: { pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' } },
         });

         // Run install --save --scope mcp (only save mcp section)
         process.chdir(testDir);
         await runCommand(['install', remoteConfigPath, '--save', '--scope', 'mcp'], { root });

         // Verify only mcp was merged
         const content = await readFile(localConfigPath, 'utf-8');
         const config = JSON.parse(content);

         // MCP should have both local and remote
         expect(config.mcp.local).toBeDefined();
         expect(config.mcp.remote).toBeDefined();

         // Rules should NOT have remote rule (only local)
         expect(Object.keys(config.rules)).toHaveLength(1);
         expect(config.rules['local-rule'].content).toBe('local rule');

         // Skills should NOT have pdf
         expect(config.skills.pdf).toBeUndefined();
      });

      it('errors when --save is used without source argument', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         const { error } = await runCommand(['install', '--save', '--config', configPath], {
            root,
         });

         expect(error?.message).toContain('--save requires a remote source');
      });

      it('supports multiple --scope flags', async () => {
         // Create local config
         const localConfigPath = join(testDir, 'ai.json');

         await writeValidConfig(localConfigPath);

         // Create remote config with multiple sections
         const remoteConfigPath = join(testDir, 'remote-ai.json');

         await writeValidConfig(remoteConfigPath, {
            mcp: { remote: { command: 'remote-cmd' } },
            rules: { 'remote-rule': { content: 'remote rule' } },
            skills: { pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' } },
         });

         // Run install --save --scope mcp --scope skills
         process.chdir(testDir);
         await runCommand(
            ['install', remoteConfigPath, '--save', '--scope', 'mcp', '--scope', 'skills'],
            { root },
         );

         // Verify mcp and skills were merged, but not rules
         const content = await readFile(localConfigPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.mcp.remote).toBeDefined();
         expect(config.skills.pdf).toBeDefined();
         expect(Object.keys(config.rules)).toHaveLength(0); // Empty from original
      });
   });
});
