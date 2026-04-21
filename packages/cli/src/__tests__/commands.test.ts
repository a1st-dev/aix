import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod, mkdir, writeFile, readFile } from 'node:fs/promises';
import { safeRm } from '@a1st/aix-core';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '@oclif/test';

const __dirname = dirname(fileURLToPath(import.meta.url)),
      root = join(__dirname, '../..'),
      loadOpts = { root, devPlugins: false };
const runCli = (args: string[] | string, _unused?: unknown) =>
   runCommand(args, loadOpts, { testNodeEnv: 'production' });

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
   }, null, 2);
}

/**
 * Write a valid config to a path
 */
async function writeValidConfig(path: string, overrides: Record<string, unknown> = {}): Promise<void> {
   await writeFile(path, createValidConfig(overrides));
}

async function writeMockSkillsCli(rootDir: string): Promise<void> {
   const binDir = join(rootDir, 'node_modules', '.bin'),
         binPath = join(binDir, 'skills');

   await mkdir(binDir, { recursive: true });
   await writeFile(binPath, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const source = process.argv[3];
let skills;

if (source === 'typescript') {
   skills = {
      typescript: {
         source: 'aix-skill-typescript',
         sourceType: 'npm'
      }
   };
} else if (source === './skills/custom') {
   skills = {
      custom: {
         source,
         sourceType: 'local'
      }
   };
} else if (source === 'anthropics/skills/skills/pdf' || source === 'https://github.com/anthropics/skills/tree/main/skills/pdf') {
   skills = {
      pdf: {
         source: 'https://github.com/anthropics/skills',
         sourceType: 'github',
         ref: 'main',
         path: 'skills/pdf'
      }
   };
} else {
   throw new Error(\`Unexpected mock skills source: \${source}\`);
}

writeFileSync('skills-lock.json', JSON.stringify({ version: 1, skills }, null, 2));
`);
   await chmod(binPath, 0o755);
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

   beforeEach(async () => {
      originalCwd = process.cwd();
      testDir = createTestDir();
      await mkdir(testDir, { recursive: true });
      await writeMockSkillsCli(testDir);
      process.chdir(testDir);
   });

   afterEach(async () => {
      process.chdir(originalCwd);
      await safeRm(testDir, { force: true });
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

      it('reports error when no config found', async () => {
         const { error } = await runCli(['validate', '--config', 'nonexistent.json'], {
            root,
         });

         expect(error).toBeDefined();
      });
   });

   describe('add skill', () => {
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

         await runCli(['add', 'skill', './skills/custom', '--config', configPath], {
            root,
         });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.custom).toEqual({ path: './skills/custom' });
      });

      it('adds a skill from GitHub tree URL and infers name/ref/path', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeValidConfig(configPath);

         await runCli(['add', 'skill', 'https://github.com/anthropics/skills/tree/main/skills/pdf', '--config', configPath], { root });

         const content = await readFile(configPath, 'utf-8');
         const config = JSON.parse(content);

         expect(config.skills.pdf).toEqual({
            git: 'https://github.com/anthropics/skills',
            ref: 'main',
            path: 'skills/pdf',
         });
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
