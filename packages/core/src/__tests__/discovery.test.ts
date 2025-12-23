import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { discoverConfig, parseConfigContent } from '../discovery.js';
import { safeRm } from '../fs/safe-rm.js';

// Use a temp directory to avoid finding ai.json in parent directories
const testDir = join(tmpdir(), 'aix-test-discovery');

describe('discoverConfig', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('finds ai.json in current directory', async () => {
      const configPath = join(testDir, 'ai.json'),
            config = { skills: {}, mcp: {} };

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.path).toBe(configPath);
      expect(result?.source).toBe('file');
   });

   it('finds ai.json in parent directory', async () => {
      const subDir = join(testDir, 'sub'),
            configPath = join(testDir, 'ai.json'),
            config = { skills: {}, mcp: {} };

      await mkdir(subDir, { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await discoverConfig(subDir);

      expect(result).toBeDefined();
      expect(result?.path).toBe(configPath);
   });

   it('finds config in package.json ai field', async () => {
      const packageJsonPath = join(testDir, 'package.json'),
            packageJson = {
               name: 'test',
               ai: { skills: {}, mcp: {} },
            };

      await writeFile(packageJsonPath, JSON.stringify(packageJson), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.source).toBe('package.json');
   });

   it('returns undefined when no config found', async () => {
      const result = await discoverConfig(testDir);

      expect(result).toBeUndefined();
   });

   it('finds local config with package.json', async () => {
      const packageJsonPath = join(testDir, 'package.json'),
            packageJson = {
               name: 'test',
               ai: { skills: {}, mcp: {} },
            },
            localJsonPath = join(testDir, 'ai.local.json'),
            localJson = {
               skills: { local: {} },
            };

      await writeFile(packageJsonPath, JSON.stringify(packageJson), 'utf-8');
      await writeFile(localJsonPath, JSON.stringify(localJson), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.source).toBe('package.json');
      expect(result?.localPath).toBe(localJsonPath);
      expect(result?.localContent).toBe(JSON.stringify(localJson));
   });

   it('finds local config with package.json string reference', async () => {
      const packageJsonPath = join(testDir, 'package.json'),
            referencedConfigPath = join(testDir, 'config', 'ai.json'),
            packageJson = {
               name: 'test',
               ai: './config/ai.json',
            },
            referencedConfig = { skills: {}, mcp: {} },
            localJsonPath = join(testDir, 'ai.local.json'),
            localJson = { rules: { local: {} } };

      await mkdir(join(testDir, 'config'), { recursive: true });
      await writeFile(packageJsonPath, JSON.stringify(packageJson), 'utf-8');
      await writeFile(referencedConfigPath, JSON.stringify(referencedConfig), 'utf-8');
      await writeFile(localJsonPath, JSON.stringify(localJson), 'utf-8');

      const result = await discoverConfig(testDir);

      expect(result).toBeDefined();
      expect(result?.source).toBe('file');
      expect(result?.path).toBe(referencedConfigPath);
      expect(result?.localPath).toBe(localJsonPath);
      expect(result?.localContent).toBe(JSON.stringify(localJson));
   });
});

describe('parseConfigContent', () => {
   it('parses valid JSON', () => {
      const content = '{"skills": {}, "mcp": {}}',
            result = parseConfigContent(content);

      expect(result).toEqual({ skills: {}, mcp: {} });
   });

   it('parses JSONC with comments', () => {
      const content = `{
      // This is a comment
      "skills": {},
      "mcp": {} // inline comment
    }`,
            result = parseConfigContent(content);

      expect(result).toEqual({ skills: {}, mcp: {} });
   });

   it('throws on invalid JSON', () => {
      const content = '{ invalid json }';

      expect(() => parseConfigContent(content)).toThrow();
   });
});
