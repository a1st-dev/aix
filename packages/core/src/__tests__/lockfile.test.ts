import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, expect, it, afterEach } from 'vitest';
import { parseConfig } from '@a1st/aix-schema';
import { ConfigParseError, generateAndWriteLockfile, generateLockfile, loadConfig, safeRm } from '../index.js';

const testDirs: string[] = [];

async function createTestDir(): Promise<string> {
   const path = join(tmpdir(), `aix-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

   await mkdir(path, { recursive: true });
   testDirs.push(path);

   return path;
}

describe('lockfile', () => {
   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((path) => safeRm(path, { force: true })));
   });

   it('generates lock entries for active entities and skips disabled entries', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            config = parseConfig({
               rules: {
                  active: { content: 'Use direct language.' },
                  disabled: false,
               },
               prompts: {
                  review: { content: 'Review this change.' },
               },
               mcp: {
                  docs: { command: 'node', args: ['server.js'] },
               },
            });

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const lockfile = await generateLockfile({ config, configPath, configBaseDir: dir });

      expect(Object.keys(lockfile.entities.rules)).to.eql(['active']);
      expect(Object.keys(lockfile.entities.prompts)).to.eql(['review']);
      expect(Object.keys(lockfile.entities.mcp)).to.eql(['docs']);
      expect(lockfile.entities.rules.active?.digest).toMatch(/^sha256:/);
      expect(lockfile.entities.rules.active?.integrity).toMatch(/^sha512-/);
   });

   it('loads a matching sibling lockfile', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            config = parseConfig({
               rules: {
                  style: { content: 'Use direct language.' },
               },
            });

      await writeFile(configPath, JSON.stringify(config), 'utf-8');
      await generateAndWriteLockfile({ config, configPath, configBaseDir: dir });

      const loaded = await loadConfig({ explicitPath: configPath });

      expect(loaded?.lockfilePath).toBe(join(dir, 'ai.lock.json'));
      expect(loaded?.lockfile?.entities.rules.style?.digest).toMatch(/^sha256:/);
   });

   it('names ai.local.json when that is the file that does not parse', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json');

      await writeFile(configPath, JSON.stringify(parseConfig({})), 'utf-8');
      await writeFile(join(dir, 'ai.local.json'), '{ "mcp": ', 'utf-8');

      const error: unknown = await loadConfig({ explicitPath: configPath }).catch((caught: unknown) => {
         return caught;
      });

      expect(error).toBeInstanceOf(ConfigParseError);
      expect(error instanceof ConfigParseError ? error.filePath : undefined).toBe(join(dir, 'ai.local.json'));
   });

   it('rejects a stale sibling lockfile', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            original = parseConfig({
               rules: {
                  style: { content: 'Use direct language.' },
               },
            }),
            changed = {
               rules: {
                  style: { content: 'Use indirect language.' },
               },
            };

      await writeFile(configPath, JSON.stringify(original), 'utf-8');
      await generateAndWriteLockfile({ config: original, configPath, configBaseDir: dir });
      await writeFile(configPath, JSON.stringify(changed), 'utf-8');

      await expect(loadConfig({ explicitPath: configPath })).rejects.toThrow(/stale/);
      await expect(loadConfig({ explicitPath: configPath, lockfileMode: 'ignore' })).resolves.toBeDefined();
   });

   it('rejects changed entity content when ai.json is unchanged', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            rulePath = join(dir, 'rules', 'style.md'),
            config = parseConfig({
               rules: {
                  style: './rules/style.md',
               },
            });

      await mkdir(join(dir, 'rules'), { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');
      await writeFile(rulePath, 'Use direct language.', 'utf-8');
      await generateAndWriteLockfile({ config, configPath, configBaseDir: dir });
      await writeFile(rulePath, 'Use indirect language.', 'utf-8');

      await expect(loadConfig({ explicitPath: configPath })).rejects.toThrow(/entities.rules.style.digest/);
   });

   it('rejects changed agent content when ai.json is unchanged', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            agentPath = join(dir, 'agents', 'reviewer.md'),
            config = parseConfig({
               agents: {
                  reviewer: './agents/reviewer.md',
               },
            });

      await mkdir(join(dir, 'agents'), { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');
      await writeFile(agentPath, 'Review the change for bugs.', 'utf-8');
      await generateAndWriteLockfile({ config, configPath, configBaseDir: dir });
      await writeFile(agentPath, 'Approve every change.', 'utf-8');

      await expect(loadConfig({ explicitPath: configPath })).rejects.toThrow(/entities.agents.reviewer.digest/);
   });

   it('rejects an agent that was added to the lockfile but is not in ai.json', async () => {
      const dir = await createTestDir(),
            configPath = join(dir, 'ai.json'),
            config = parseConfig({
               agents: {
                  reviewer: { content: 'Review the change for bugs.' },
               },
            });

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const { lockfilePath, lockfile } = await generateAndWriteLockfile({ config, configPath, configBaseDir: dir }),
            reviewer = lockfile.entities.agents.reviewer;

      lockfile.entities.agents = { ...lockfile.entities.agents, ...(reviewer && { planted: { ...reviewer, name: 'planted' } }) };
      await writeFile(lockfilePath, JSON.stringify(lockfile), 'utf-8');

      await expect(loadConfig({ explicitPath: configPath })).rejects.toThrow(/entities.agents.planted/);
   });
});
