import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { loadConfig } from '../loader.js';
import { updateLocalConfig, getLocalConfigPath } from '../updater.js';
import { discoverConfig } from '../discovery.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-local-overrides');

describe('local overrides - discovery', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('discovers ai.local.json alongside ai.json', async () => {
      const aiJson = { skills: { typescript: '^1.0.0' } },
            localJson = { skills: { react: '^2.0.0' } };

      await writeFile(join(testDir, 'ai.json'), JSON.stringify(aiJson), 'utf-8');
      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.path).toBe(join(testDir, 'ai.json'));
      expect(result?.localPath).toBe(join(testDir, 'ai.local.json'));
      expect(result?.localContent).toBeDefined();
   });

   it('discovers ai.local.json alone (no ai.json)', async () => {
      const localJson = { skills: { react: '^2.0.0' } };

      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.content).toBe('{}'); // Empty base config
      expect(result?.localPath).toBe(join(testDir, 'ai.local.json'));
      expect(result?.localContent).toBeDefined();
   });

   it('returns undefined when neither ai.json nor ai.local.json exists', async () => {
      const result = await discoverConfig(testDir);

      expect(result).toBeUndefined();
   });
});

describe('local overrides - loading', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('merges local config on top of base config', async () => {
      const aiJson = {
               skills: { typescript: '^1.0.0', shared: '^1.0.0' },
               mcp: { github: { command: 'npx github' } },
            },
            localJson = {
               skills: { react: '^2.0.0', shared: '^2.0.0' }, // shared overrides base
            };

      await writeFile(join(testDir, 'ai.json'), JSON.stringify(aiJson), 'utf-8');
      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result).toBeDefined();
      expect(result?.hasLocalOverrides).toBe(true);
      expect(result?.localPath).toBe(join(testDir, 'ai.local.json'));
      // Skills should be merged with local winning
      expect(result?.config.skills).toEqual({
         typescript: '^1.0.0',
         react: '^2.0.0',
         shared: '^2.0.0', // Local wins
      });
      // MCP should be preserved from base
      expect(result?.config.mcp?.github).toBeDefined();
   });

   it('loads only ai.local.json when ai.json does not exist', async () => {
      const localJson = { skills: { react: '^2.0.0' } };

      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result).toBeDefined();
      expect(result?.hasLocalOverrides).toBe(true);
      expect(result?.config.skills).toEqual({ react: '^2.0.0' });
   });

   it('rejects extends in ai.local.json', async () => {
      const aiJson = { skills: {} },
            localJson = { extends: './other.json', skills: { react: '^2.0.0' } };

      await writeFile(join(testDir, 'ai.json'), JSON.stringify(aiJson), 'utf-8');
      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      await expect(loadConfig(undefined, testDir)).rejects.toThrow(/extends/i);
   });

   it('resolves extends in ai.json before merging local', async () => {
      const baseJson = { skills: { base: '^1.0.0' } },
            aiJson = { extends: './base.json', skills: { main: '^1.0.0' } },
            localJson = { skills: { local: '^1.0.0' } };

      await writeFile(join(testDir, 'base.json'), JSON.stringify(baseJson), 'utf-8');
      await writeFile(join(testDir, 'ai.json'), JSON.stringify(aiJson), 'utf-8');
      await writeFile(join(testDir, 'ai.local.json'), JSON.stringify(localJson), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result?.config.skills).toEqual({
         base: '^1.0.0',
         main: '^1.0.0',
         local: '^1.0.0',
      });
   });
});

describe('local overrides - updating', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('creates ai.local.json if it does not exist', async () => {
      const localPath = join(testDir, 'ai.local.json');

      expect(existsSync(localPath)).toBe(false);

      await updateLocalConfig(localPath, (config) => ({
         ...config,
         skills: { newskill: '^1.0.0' },
      }));

      expect(existsSync(localPath)).toBe(true);

      const content = JSON.parse(await readFile(localPath, 'utf-8'));

      expect(content.skills).toEqual({ newskill: '^1.0.0' });
   });

   it('updates existing ai.local.json', async () => {
      const localPath = join(testDir, 'ai.local.json'),
            existingConfig = { skills: { existing: '^1.0.0' } };

      await writeFile(localPath, JSON.stringify(existingConfig), 'utf-8');

      await updateLocalConfig(localPath, (config) => ({
         ...config,
         skills: { ...config.skills, newskill: '^2.0.0' },
      }));

      const content = JSON.parse(await readFile(localPath, 'utf-8'));

      expect(content.skills).toEqual({
         existing: '^1.0.0',
         newskill: '^2.0.0',
      });
   });

   it('rejects extends when updating local config', async () => {
      const localPath = join(testDir, 'ai.local.json');

      await expect(
         updateLocalConfig(
            localPath,
            () =>
               ({
                  extends: './other.json',
                  skills: {},
               }) as never,
         ),
      ).rejects.toThrow();
   });
});

describe('getLocalConfigPath', () => {
   it('converts ai.json path to ai.local.json', () => {
      expect(getLocalConfigPath('/project/ai.json')).toBe('/project/ai.local.json');
   });

   it('handles other json files', () => {
      expect(getLocalConfigPath('/project/config.json')).toBe('/project/config.local.json');
   });

   it('handles directory paths', () => {
      expect(getLocalConfigPath('/project')).toBe('/project/ai.local.json');
   });
});
