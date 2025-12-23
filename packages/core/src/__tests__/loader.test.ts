import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { loadConfig, requireConfig } from '../loader.js';
import { safeRm } from '../fs/safe-rm.js';
import { ConfigNotFoundError } from '../errors.js';

// Use a temp directory to avoid finding ai.json in parent directories
const testDir = join(tmpdir(), 'aix-test-loader');

describe('loadConfig', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('loads and validates config', async () => {
      const config = {
               $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
               skills: {},
               mcp: {},
            },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result).toBeDefined();
      expect(result?.config).toBeDefined();
      expect(result?.path).toBe(configPath);
   });

   it('resolves extends before validation', async () => {
      const baseConfig = { skills: { typescript: '^1.0.0' } },
            baseConfigPath = join(testDir, 'base.json'),
            config = { extends: './base.json', skills: { react: '^1.0.0' } },
            configPath = join(testDir, 'ai.json');

      await writeFile(baseConfigPath, JSON.stringify(baseConfig), 'utf-8');
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result?.config.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
      });
   });

   it('returns undefined when no config found', async () => {
      const result = await loadConfig(undefined, testDir);

      expect(result).toBeUndefined();
   });

   it('returns warning when both ai.json and package.json ai field exist', async () => {
      const aiJsonConfig = { skills: { typescript: '^1.0.0' }, mcp: {} },
            packageJsonConfig = {
               name: 'test-project',
               ai: { skills: { react: '^1.0.0' }, mcp: {} },
            };

      await writeFile(join(testDir, 'ai.json'), JSON.stringify(aiJsonConfig), 'utf-8');
      await writeFile(join(testDir, 'package.json'), JSON.stringify(packageJsonConfig), 'utf-8');

      const result = await loadConfig(undefined, testDir);

      expect(result).toBeDefined();
      expect(result?.source).toBe('file');
      expect(result?.config.skills).toEqual({ typescript: '^1.0.0' });
      expect(result?.warnings).toHaveLength(1);
      expect(result?.warnings?.[0]).toContain('ai.json');
      expect(result?.warnings?.[0]).toContain('package.json');
   });
});

describe('requireConfig', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('throws when config not found', async () => {
      await expect(requireConfig(undefined, testDir)).rejects.toThrow(ConfigNotFoundError);
   });

   it('returns config when found', async () => {
      const config = { skills: {}, mcp: {} },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await requireConfig(undefined, testDir);

      expect(result).toBeDefined();
   });
});
