import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { resolveExtends } from '../inheritance.js';
import { CircularDependencyError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.cwd(), 'test-fixtures', 'inheritance'),
      originalFetch = global.fetch;

describe('resolveExtends', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
      global.fetch = originalFetch;
   });

   it('returns config without extends as-is', async () => {
      const config = { skills: { typescript: '^1.0.0' }, mcp: {} },
            result = await resolveExtends(config, { baseDir: testDir });

      expect(result).toEqual(config);
   });

   it('merges local file extends', async () => {
      const baseConfig = { skills: { typescript: '^1.0.0' }, mcp: {} },
            baseConfigPath = join(testDir, 'base.json');

      await writeFile(baseConfigPath, JSON.stringify(baseConfig), 'utf-8');

      const config = {
         extends: './base.json',
         skills: { react: '^1.0.0' },
      };

      const result = await resolveExtends(config, { baseDir: testDir });

      expect(result.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
      });
   });

   it('deep merges objects', async () => {
      const baseConfig = {
               skills: { typescript: '^1.0.0' },
               mcp: { github: { enabled: true } },
            },
            baseConfigPath = join(testDir, 'base.json');

      await writeFile(baseConfigPath, JSON.stringify(baseConfig), 'utf-8');

      const config = {
         extends: './base.json',
         mcp: { github: { enabled: false } },
      };

      const result = await resolveExtends(config, { baseDir: testDir });

      expect(result.mcp).toEqual({
         github: { enabled: false },
      });
   });

   it('replaces arrays entirely', async () => {
      const baseConfig = {
               rules: { project: ['Use TypeScript'] },
            },
            baseConfigPath = join(testDir, 'base.json');

      await writeFile(baseConfigPath, JSON.stringify(baseConfig), 'utf-8');

      const config = {
         extends: './base.json',
         rules: ['Use React'],
      };

      const result = await resolveExtends(config, { baseDir: testDir });

      expect(result.rules).toEqual(['Use React']);
   });

   it('detects circular dependencies', async () => {
      const configA = { extends: './b.json', skills: {} },
            configB = { extends: './a.json', skills: {} },
            pathA = join(testDir, 'a.json'),
            pathB = join(testDir, 'b.json');

      await writeFile(pathA, JSON.stringify(configA), 'utf-8');
      await writeFile(pathB, JSON.stringify(configB), 'utf-8');

      await expect(resolveExtends(configA, { baseDir: testDir })).rejects.toThrow(
         CircularDependencyError,
      );
   });

   it('handles multiple extends in order', async () => {
      const base1 = { skills: { typescript: '^1.0.0' } },
            base2 = { skills: { react: '^1.0.0' } },
            path1 = join(testDir, 'base1.json'),
            path2 = join(testDir, 'base2.json');

      await writeFile(path1, JSON.stringify(base1), 'utf-8');
      await writeFile(path2, JSON.stringify(base2), 'utf-8');

      const config = {
         extends: ['./base1.json', './base2.json'],
         skills: { vue: '^1.0.0' },
      };

      const result = await resolveExtends(config, { baseDir: testDir });

      expect(result.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
         vue: '^1.0.0',
      });
   });

   it('loads HTTPS file extends', async () => {
      const baseConfig = { skills: { typescript: '^1.0.0' } },
            config = {
               extends: 'https://example.com/ai.json',
               skills: { react: '^1.0.0' },
            },
            fetchMock = vi.fn().mockResolvedValue({
               ok: true,
               text: () => Promise.resolve(JSON.stringify(baseConfig)),
            });

      global.fetch = fetchMock;

      const result = await resolveExtends(config, { baseDir: testDir });

      expect(result.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
      });
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/ai.json');
   });

   it('converts GitHub blob URL extends to raw URL', async () => {
      const baseConfig = { skills: { typescript: '^1.0.0' } },
            config = {
               extends: 'https://github.com/org/repo/blob/main/ai.json',
               skills: { react: '^1.0.0' },
            },
            fetchMock = vi.fn().mockResolvedValue({
               ok: true,
               text: () => Promise.resolve(JSON.stringify(baseConfig)),
            });

      global.fetch = fetchMock;

      await resolveExtends(config, { baseDir: testDir });

      expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/org/repo/main/ai.json');
   });
});
