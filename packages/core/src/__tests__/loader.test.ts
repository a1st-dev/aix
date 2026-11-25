import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { loadConfig, requireConfig } from '../loader.js';
import { safeRm } from '../fs/safe-rm.js';
import {
   CircularDependencyError,
   ConfigNotFoundError,
   ConfigParseError,
   ConfigValidationError,
   RemoteFetchError,
} from '../errors.js';
import { nodeRuntimeAdapter, withRuntimeAdapter, type RuntimeAdapter } from '../runtime/index.js';

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

   it('uses the same source identity for relative and absolute local paths', async () => {
      const configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify({ skills: {}, mcp: {} }), 'utf-8');

      const relative = await loadConfig({ remoteSource: './ai.json', startDir: testDir }),
            absolute = await loadConfig({ remoteSource: configPath, startDir: testDir });

      expect(relative?.path).toBe(configPath);
      expect(absolute?.path).toBe(relative?.path);
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

   describe('validation errors', () => {
      async function getLoadError(options: Parameters<typeof loadConfig>[0]): Promise<unknown> {
         return loadConfig(options).catch((error: unknown) => {
            return error;
         });
      }

      it('reports the received value for a wrong-typed field in a discovered config', async () => {
         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ skills: 'not-an-object' }), 'utf-8');

         const error = await getLoadError({ startDir: testDir });

         expect(error).toBeInstanceOf(ConfigValidationError);
         expect(error instanceof ConfigValidationError && error.errors).toEqual([
            { path: 'skills', message: 'Expected object, received string ("not-an-object")' },
         ]);
      });

      it('reports the received value for a wrong-typed field in a config loaded by source', async () => {
         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ mcp: { docs: 42 } }), 'utf-8');

         const error = await getLoadError({ remoteSource: './ai.json', startDir: testDir });

         expect(error).toBeInstanceOf(ConfigValidationError);
         expect(error instanceof Error && error.message).toContain('received number (42)');
         expect(error instanceof Error && error.message).not.toContain('received undefined');
      });

      it('reports invalid hooks in an extended config with their full path', async () => {
         const baseConfig = { hooks: { pre_command: [{ hooks: 'not-an-array' }] } };

         await writeFile(join(testDir, 'base.json'), JSON.stringify(baseConfig), 'utf-8');
         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ extends: './base.json' }), 'utf-8');

         const error = await getLoadError({ startDir: testDir });

         expect(error).toBeInstanceOf(ConfigValidationError);
         expect(error instanceof ConfigValidationError && error.errors).toEqual([
            { path: 'hooks.pre_command.0.hooks', message: 'Expected array, received string ("not-an-array")' },
         ]);
      });
   });

   describe('errors from extended configs', () => {
      it('reports a circular extends as a circular dependency', async () => {
         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ extends: './base.json' }), 'utf-8');
         await writeFile(join(testDir, 'base.json'), JSON.stringify({ extends: './ai.json' }), 'utf-8');

         await expect(loadConfig({ startDir: testDir })).rejects.toThrow(CircularDependencyError);
      });

      it('reports a failed download of an extended config as a fetch error', async () => {
         const adapter: RuntimeAdapter = {
            ...nodeRuntimeAdapter,
            network: {
               ...nodeRuntimeAdapter.network,
               fetch: async () => {
                  throw new Error('getaddrinfo ENOTFOUND example.com');
               },
            },
         };

         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ extends: 'https://example.com/ai.json' }), 'utf-8');

         const error: unknown = await withRuntimeAdapter(adapter, () => {
            return loadConfig({ startDir: testDir });
         }).catch((caught: unknown) => {
            return caught;
         });

         expect(error).toBeInstanceOf(RemoteFetchError);
         expect(error instanceof RemoteFetchError && error.url).toBe('https://example.com/ai.json');
      });

      it('names the extended file, not ai.json, when the extended file has a syntax error', async () => {
         const basePath = join(testDir, 'base.json');

         await writeFile(join(testDir, 'ai.json'), JSON.stringify({ extends: './base.json' }), 'utf-8');
         await writeFile(basePath, '{ "skills": ', 'utf-8');

         const error: unknown = await loadConfig({ startDir: testDir }).catch((caught: unknown) => {
            return caught;
         });

         expect(error).toBeInstanceOf(ConfigParseError);
         expect(error instanceof ConfigParseError && error.filePath).toBe(basePath);
      });

      it('names ai.json when ai.json itself has a syntax error', async () => {
         const configPath = join(testDir, 'ai.json');

         await writeFile(configPath, '{ "skills": ', 'utf-8');

         const error: unknown = await loadConfig({ startDir: testDir }).catch((caught: unknown) => {
            return caught;
         });

         expect(error).toBeInstanceOf(ConfigParseError);
         expect(error instanceof ConfigParseError && error.filePath).toBe(configPath);
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
