import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { resolveExtends } from '../inheritance.js';
import { CircularDependencyError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';
import { nodeRuntimeAdapter, withRuntimeAdapter } from '../runtime/index.js';
import type { RuntimeAdapter } from '../runtime/index.js';

const testDir = join(process.env.HOME ?? '', 'test-fixtures', 'inheritance'),
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
            result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

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

      const result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

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

      const result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

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

      const result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

      expect(result.rules).toEqual(['Use React']);
   });

   it('detects circular dependencies', async () => {
      const configA = { extends: './b.json', skills: {} },
            configB = { extends: './a.json', skills: {} },
            pathA = join(testDir, 'a.json'),
            pathB = join(testDir, 'b.json');

      await writeFile(pathA, JSON.stringify(configA), 'utf-8');
      await writeFile(pathB, JSON.stringify(configB), 'utf-8');

      await expect(resolveExtends(configA, { baseDir: testDir, projectRoot: testDir })).rejects.toThrow(
         CircularDependencyError,
      );
   });

   it('reports the chain of configs that forms the cycle', async () => {
      const pathA = join(testDir, 'a.json'),
            pathB = join(testDir, 'b.json');

      await writeFile(pathA, JSON.stringify({ extends: './b.json' }), 'utf-8');
      await writeFile(pathB, JSON.stringify({ extends: './a.json' }), 'utf-8');

      const error: unknown = await resolveExtends({ extends: './a.json' }, { baseDir: testDir, projectRoot: testDir })
         .catch((caught: unknown) => {
            return caught;
         });

      expect(error).toBeInstanceOf(CircularDependencyError);
      expect(error instanceof CircularDependencyError && error.path).toEqual([pathA, pathB, pathA]);
   });

   it('allows two extended configs to share a base config', async () => {
      const shared = { skills: { typescript: '^1.0.0' } },
            left = { extends: './shared.json', skills: { react: '^1.0.0' } },
            right = { extends: './shared.json', skills: { vue: '^1.0.0' } };

      await writeFile(join(testDir, 'shared.json'), JSON.stringify(shared), 'utf-8');
      await writeFile(join(testDir, 'left.json'), JSON.stringify(left), 'utf-8');
      await writeFile(join(testDir, 'right.json'), JSON.stringify(right), 'utf-8');

      const result = await resolveExtends(
         { extends: ['./left.json', './right.json'] },
         { baseDir: testDir, projectRoot: testDir },
      );

      expect(result.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
         vue: '^1.0.0',
      });
   });

   it('allows the same config to be extended twice at different depths', async () => {
      const shared = { skills: { typescript: '^1.0.0' } },
            middle = { extends: './shared.json', skills: { react: '^1.0.0' } };

      await writeFile(join(testDir, 'shared.json'), JSON.stringify(shared), 'utf-8');
      await writeFile(join(testDir, 'middle.json'), JSON.stringify(middle), 'utf-8');

      const result = await resolveExtends(
         { extends: ['./shared.json', './middle.json'] },
         { baseDir: testDir, projectRoot: testDir },
      );

      expect(result.skills).toEqual({
         typescript: '^1.0.0',
         react: '^1.0.0',
      });
   });

   it('detects a cycle that sits below a shared base config', async () => {
      const left = { extends: './shared.json' },
            right = { extends: './shared.json' },
            shared = { extends: './loop.json' },
            loop = { extends: './shared.json' };

      await writeFile(join(testDir, 'left.json'), JSON.stringify(left), 'utf-8');
      await writeFile(join(testDir, 'right.json'), JSON.stringify(right), 'utf-8');
      await writeFile(join(testDir, 'shared.json'), JSON.stringify(shared), 'utf-8');
      await writeFile(join(testDir, 'loop.json'), JSON.stringify(loop), 'utf-8');

      await expect(resolveExtends(
         { extends: ['./left.json', './right.json'] },
         { baseDir: testDir, projectRoot: testDir },
      )).rejects.toThrow(CircularDependencyError);
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

      const result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

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

      const result = await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

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

      await resolveExtends(config, { baseDir: testDir, projectRoot: testDir });

      expect(fetchMock).toHaveBeenCalledWith('https://raw.githubusercontent.com/org/repo/main/ai.json');
   });

   describe('local paths in an extended config', () => {
      const sharedDir = join(testDir, 'shared');

      async function resolveSharedConfig(sharedConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
         await mkdir(sharedDir, { recursive: true });
         await writeFile(join(sharedDir, 'ai.json'), JSON.stringify(sharedConfig), 'utf-8');

         return resolveExtends({ extends: './shared/ai.json' }, { baseDir: testDir, projectRoot: testDir });
      }

      it('rebases object-form rule, prompt and agent paths onto the extended config directory', async () => {
         const result = await resolveSharedConfig({
            rules: { style: { path: './rules/style.md', activation: 'always' } },
            prompts: { review: { path: 'prompts/review.md', description: 'Review' } },
            agents: { reviewer: { path: '../agents/reviewer.md' } },
         });

         expect(result.rules).toEqual({
            style: { path: join(sharedDir, 'rules/style.md'), activation: 'always' },
         });
         expect(result.prompts).toEqual({
            review: { path: join(sharedDir, 'prompts/review.md'), description: 'Review' },
         });
         expect(result.agents).toEqual({
            reviewer: { path: join(testDir, 'agents/reviewer.md') },
         });
      });

      it('rebases string-form paths in every section that holds references', async () => {
         const result = await resolveSharedConfig({
            skills: { pdf: './skills/pdf' },
            rules: { style: './rules/style.md', tests: 'file:rules/tests.md' },
            prompts: { review: 'prompts/review.md' },
            agents: { reviewer: './agents/reviewer.md' },
         });

         expect(result.skills).toEqual({ pdf: join(sharedDir, 'skills/pdf') });
         expect(result.rules).toEqual({
            style: join(sharedDir, 'rules/style.md'),
            tests: join(sharedDir, 'rules/tests.md'),
         });
         expect(result.prompts).toEqual({ review: join(sharedDir, 'prompts/review.md') });
         expect(result.agents).toEqual({ reviewer: join(sharedDir, 'agents/reviewer.md') });
      });

      it('rebases skill paths in object form and inside a source wrapper', async () => {
         const result = await resolveSharedConfig({
            skills: {
               pdf: { path: './skills/pdf' },
               docs: { source: './skills/docs', enabled: true },
               charts: { source: { path: 'skills/charts' } },
            },
         });

         expect(result.skills).toEqual({
            pdf: { path: join(sharedDir, 'skills/pdf') },
            docs: { source: join(sharedDir, 'skills/docs'), enabled: true },
            charts: { source: { path: join(sharedDir, 'skills/charts') } },
         });
      });

      it('leaves a path that points inside a git repository or npm package alone', async () => {
         const skills = {
                  remote: { git: 'github:acme/skills', path: 'skills/pdf' },
                  packaged: { npm: '@acme/skills', path: 'skills/pdf' },
                  wrapped: { source: { git: 'github:acme/skills', path: 'skills/docs' } },
               },
               rules = {
                  remote: { git: { url: 'github:acme/rules', path: 'rules/style.md' } },
                  packaged: { npm: { npm: '@acme/rules', path: 'rules/style.md' } },
               };

         const result = await resolveSharedConfig({ skills, rules });

         expect(result.skills).toEqual(skills);
         expect(result.rules).toEqual(rules);
      });

      it('leaves inline content, disabled entries and non-path strings alone', async () => {
         const config = {
            skills: { typescript: '^1.0.0', disabled: false },
            rules: { inline: { content: 'Use ./relative/imports.md wisely' }, remote: 'github:acme/rules' },
            prompts: { disabled: false },
         };

         const result = await resolveSharedConfig(config);

         expect(result).toEqual(config);
      });
   });

   describe('git extends dependencies', () => {
      async function resolveGitExtends(files: Record<string, string>): Promise<string[]> {
         const installedDirs: string[] = [],
               adapter: RuntimeAdapter = {
                  ...nodeRuntimeAdapter,
                  git: {
                     downloadTemplate: async (_template, options) => {
                        const dir = options.dir ?? '';

                        await mkdir(dir, { recursive: true });
                        await Promise.all(Object.entries(files).map(([ name, content ]) => {
                           return writeFile(join(dir, name), content, 'utf-8');
                        }));

                        return { dir };
                     },
                  },
                  npm: {
                     ...nodeRuntimeAdapter.npm,
                     installDependencies: async (cwd) => {
                        installedDirs.push(cwd);
                     },
                  },
               };

         await withRuntimeAdapter(adapter, () => {
            return resolveExtends({ extends: 'github:org/config#main' }, { baseDir: testDir, projectRoot: testDir });
         });

         return installedDirs;
      }

      it('installs dependencies in the extends copy when it has a package.json', async () => {
         const installedDirs = await resolveGitExtends({ 'ai.json': '{}', 'package.json': '{}' });

         expect(installedDirs).toHaveLength(1);
         expect(installedDirs[0]?.startsWith(join(testDir, '.aix', 'extends'))).toBe(true);
      });

      it('skips the install when the extends copy has no package.json', async () => {
         const installedDirs = await resolveGitExtends({ 'ai.json': '{}' });

         expect(installedDirs).toEqual([]);
      });
   });
});
