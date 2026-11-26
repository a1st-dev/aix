import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'pathe';
import { createDownloadKey } from '../git-download.js';
import { resolveExtends } from '../inheritance.js';
import { CircularDependencyError, ConfigParseError, RemoteFetchError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';
import { nodeRuntimeAdapter, withRuntimeAdapter } from '../runtime/index.js';
import type { RuntimeAdapter } from '../runtime/index.js';

const testDir = join(process.env.HOME ?? '', 'test-fixtures', 'inheritance'),
      originalFetch = global.fetch;

/** Stands in for a git repository whose content and availability a test can change. */
interface FakeRemote {
   files: Record<string, string>;
   offline?: boolean;
   installFails?: boolean;
   /** Directories the package manager was asked to install in */
   installs: string[];
}

function createRemote(files: Record<string, string>): FakeRemote {
   return { files, installs: [] };
}

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

   it('lets an override change the content source of an inherited rule', async () => {
      const baseConfigPath = join(testDir, 'base.json');

      await writeFile(baseConfigPath, JSON.stringify({
         rules: { style: { content: 'Inline base rule.', description: 'Style' } },
      }), 'utf-8');

      const result = await resolveExtends(
         { extends: './base.json', rules: { style: { path: './style.md' } } },
         { baseDir: testDir, projectRoot: testDir },
      );

      expect(result.rules.style).toEqual({ path: './style.md', description: 'Style' });
   });

   it('lets an override change the transport of an inherited MCP server and keeps its other fields', async () => {
      const baseConfigPath = join(testDir, 'base.json');

      await writeFile(baseConfigPath, JSON.stringify({
         mcp: { docs: { command: 'npx', args: [ 'docs-server' ], env: { TOKEN: 'abc' } } },
      }), 'utf-8');

      const result = await resolveExtends(
         { extends: './base.json', mcp: { docs: { url: 'https://example.com/mcp' } } },
         { baseDir: testDir, projectRoot: testDir },
      );

      expect(result.mcp.docs).toEqual({ url: 'https://example.com/mcp', env: { TOKEN: 'abc' } });
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
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/ai.json', { signal: expect.any(AbortSignal) });
   });

   it('resolves the relative paths of a GitHub blob URL extends inside the downloaded folder', async () => {
      const templates: string[] = [],
            adapter: RuntimeAdapter = {
               ...nodeRuntimeAdapter,
               git: {
                  downloadTemplate: async (template, options) => {
                     const dir = options.dir ?? '';

                     templates.push(template);
                     await mkdir(join(dir, 'my-skill'), { recursive: true });
                     await writeFile(join(dir, 'team.json'), '{ "skills": { "my-skill": { "path": "./my-skill/" } } }', 'utf-8');
                     await writeFile(join(dir, 'my-skill', 'SKILL.md'), '# My skill', 'utf-8');

                     return { dir };
                  },
               },
            },
            template = 'github:org/repo/packages/skills#main';

      const result = await withRuntimeAdapter(adapter, () => {
         return resolveExtends(
            { extends: 'https://github.com/org/repo/blob/main/packages/skills/team.json' },
            { baseDir: testDir, projectRoot: testDir },
         );
      });

      expect(templates).toEqual([ template ]);
      expect(result.skills).toEqual({
         'my-skill': { path: join(testDir, '.aix', 'extends', createDownloadKey(template), 'my-skill') },
      });
      expect(existsSync(join(testDir, '.aix', 'extends', createDownloadKey(template), 'my-skill', 'SKILL.md'))).toStrictEqual(true);
   });

   it('rejects relative paths in a config extended by a plain URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve('{ "rules": { "style": { "path": "./rules/style.md" }, "inline": { "content": "Be brief" } } }'),
      });

      const result = resolveExtends({ extends: 'https://example.com/ai.json' }, { baseDir: testDir, projectRoot: testDir });

      await expect(result).rejects.toThrow('cannot use relative paths (rules.style: ./rules/style.md)');
   });

   it('gives up on an HTTPS extends whose server never finishes responding', async () => {
      const requestedUrls: string[] = [],
            adapter: RuntimeAdapter = {
               ...nodeRuntimeAdapter,
               network: {
                  ...nodeRuntimeAdapter.network,
                  fetch: (url, init) => {
                     requestedUrls.push(url);

                     return new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                           reject(new DOMException('This operation was aborted', 'AbortError'));
                        });
                     });
                  },
               },
            };

      vi.useFakeTimers();

      try {
         const result = withRuntimeAdapter(adapter, () => {
            return resolveExtends({ extends: 'https://example.com/ai.json' }, { baseDir: testDir, projectRoot: testDir });
         });

         const assertion = expect(result).rejects.toThrow(RemoteFetchError);

         await vi.advanceTimersByTimeAsync(60_000);
         await assertion;
      } finally {
         vi.useRealTimers();
      }

      expect(requestedUrls).toEqual(['https://example.com/ai.json']);
   });

   describe('npm extends', () => {
      const packageDir = join(testDir, 'node_modules', '@acme', 'ai-config'),
            packageConfigPath = join(packageDir, 'ai.json');

      function resolveNpmExtends(resolvePackagePath: RuntimeAdapter['npm']['resolvePackagePath']): Promise<unknown> {
         const adapter: RuntimeAdapter = {
            ...nodeRuntimeAdapter,
            npm: { ...nodeRuntimeAdapter.npm, resolvePackagePath },
         };

         return withRuntimeAdapter(adapter, () => {
            return resolveExtends({ extends: '@acme/ai-config' }, { baseDir: testDir, projectRoot: testDir });
         }).catch((caught: unknown) => {
            return caught;
         });
      }

      beforeEach(async () => {
         await mkdir(packageDir, { recursive: true });
      });

      it('reports a syntax error in the package config as a parse error in that file', async () => {
         await writeFile(packageConfigPath, '{ "skills": ', 'utf-8');

         const error = await resolveNpmExtends(async () => {
            return packageConfigPath;
         });

         expect(error).toBeInstanceOf(ConfigParseError);
         expect(error instanceof ConfigParseError && error.filePath).toBe(packageConfigPath);
         expect(error instanceof Error && error.message).not.toContain('Failed to resolve npm package');
      });

      it('reports a package config that is not an object as a parse error in that file', async () => {
         await writeFile(packageConfigPath, '["skills"]', 'utf-8');

         const error = await resolveNpmExtends(async () => {
            return packageConfigPath;
         });

         expect(error).toBeInstanceOf(ConfigParseError);
         expect(error instanceof Error && error.message).toContain(`${packageConfigPath}: Expected a JSON object`);
      });

      it('reports a package that cannot be found as a resolution failure', async () => {
         const error = await resolveNpmExtends(async () => {
            throw new Error("Cannot find module '@acme/ai-config/ai.json'");
         });

         expect(error).toBeInstanceOf(ConfigParseError);
         expect(error instanceof Error && error.message).toContain('Failed to resolve npm package: @acme/ai-config');
      });

      it('rebases paths in the package config onto the package directory', async () => {
         await writeFile(packageConfigPath, JSON.stringify({ rules: { style: './rules/style.md' } }), 'utf-8');

         const result = await resolveNpmExtends(async () => {
            return packageConfigPath;
         });

         expect(result).toEqual({ rules: { style: join(packageDir, 'rules/style.md') } });
      });
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

   describe('git extends', () => {
      const EXTENDS = 'github:org/config#main',
            copyDir = join(testDir, '.aix', 'extends', createDownloadKey(EXTENDS));

      function loadConfigExtending(
         remote: FakeRemote,
         extendsValue: string = EXTENDS,
         installDependencies: boolean = true,
      ): Promise<Record<string, unknown>> {
         const adapter: RuntimeAdapter = {
            ...nodeRuntimeAdapter,
            git: {
               downloadTemplate: async (_template, options) => {
                  const dir = options.dir ?? '';

                  if (remote.offline) {
                     throw new Error('getaddrinfo ENOTFOUND codeload.github.com');
                  }

                  await Promise.all(Object.entries(remote.files).map(async ([name, content]) => {
                     await mkdir(dirname(join(dir, name)), { recursive: true });
                     await writeFile(join(dir, name), content, 'utf-8');
                  }));

                  return { dir };
               },
            },
            npm: {
               ...nodeRuntimeAdapter.npm,
               installDependencies: async (cwd) => {
                  remote.installs.push(cwd);

                  if (remote.installFails) {
                     throw new Error('npm install failed');
                  }

                  await mkdir(join(cwd, 'node_modules', 'dependency'), { recursive: true });
                  await writeFile(join(cwd, 'node_modules', 'dependency', 'index.js'), '', 'utf-8');
               },
            },
         };

         return withRuntimeAdapter(adapter, () => {
            return resolveExtends({ extends: extendsValue }, { baseDir: testDir, projectRoot: testDir, installDependencies });
         });
      }

      describe('a load that may not install dependencies', () => {
         it('never runs the package manager, and leaves a first copy without packages', async () => {
            const remote = createRemote({ 'ai.json': '{ "rules": { "style": { "content": "New" } } }', 'package.json': '{}' });

            const config = await loadConfigExtending(remote, EXTENDS, false);

            expect(remote.installs).toEqual([]);
            expect(config.rules).toEqual({ style: { content: 'New' } });
            expect(existsSync(join(copyDir, 'node_modules'))).toStrictEqual(false);
         });

         it('keeps reading the installed copy when the new version would need an install', async () => {
            const remote = createRemote({ 'ai.json': '{ "rules": { "style": { "content": "Old" } } }', 'package.json': '{}' });

            await loadConfigExtending(remote);
            remote.files['ai.json'] = '{ "rules": { "style": { "content": "New" } } }';
            remote.files['package.json'] = '{ "dependencies": { "left-pad": "1.3.0" } }';

            const config = await loadConfigExtending(remote, EXTENDS, false);

            expect(remote.installs).toHaveLength(1);
            expect(config.rules).toEqual({ style: { content: 'Old' } });
            expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
         });

         it('is followed by an install on the next load that may install', async () => {
            const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}' });

            await loadConfigExtending(remote, EXTENDS, false);
            await loadConfigExtending(remote);

            expect(remote.installs).toHaveLength(1);
            expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
         });
      });

      it('installs dependencies before the download becomes the extends copy', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}' });

         await loadConfigExtending(remote);

         expect(remote.installs).toHaveLength(1);
         expect(remote.installs[0]?.startsWith(join(testDir, '.aix', 'extends'))).toStrictEqual(false);
         expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
      });

      it('skips the install when the extends copy has no package.json', async () => {
         const remote = createRemote({ 'ai.json': '{}' });

         await loadConfigExtending(remote);

         expect(remote.installs).toEqual([]);
      });

      it('does not install again while the dependency manifests are unchanged', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}', 'rules/style.md': 'Old' });

         await loadConfigExtending(remote);
         remote.files['rules/style.md'] = 'New';
         await loadConfigExtending(remote);
         await loadConfigExtending(remote);

         expect(remote.installs).toHaveLength(1);
         expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
         expect(await readFile(join(copyDir, 'rules/style.md'), 'utf-8')).toBe('New');
      });

      it('installs again when package.json changes', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}' });

         await loadConfigExtending(remote);
         remote.files['package.json'] = '{ "dependencies": { "left-pad": "1.3.0" } }';
         await loadConfigExtending(remote);

         expect(remote.installs).toHaveLength(2);
      });

      it('keeps the existing copy when the download fails', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}', 'scripts/check.sh': 'exit 0' });

         await loadConfigExtending(remote);
         remote.offline = true;

         await expect(loadConfigExtending(remote)).rejects.toThrow('ENOTFOUND');

         expect(await readFile(join(copyDir, 'scripts/check.sh'), 'utf-8')).toBe('exit 0');
         expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
      });

      it('keeps the existing copy when the dependency install fails', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'package.json': '{}' });

         await loadConfigExtending(remote);
         remote.files['package.json'] = '{ "dependencies": { "left-pad": "1.3.0" } }';
         remote.installFails = true;

         await expect(loadConfigExtending(remote)).rejects.toThrow('npm install failed');

         expect(await readFile(join(copyDir, 'package.json'), 'utf-8')).toBe('{}');
         expect(existsSync(join(copyDir, 'node_modules', 'dependency', 'index.js'))).toStrictEqual(true);
      });

      it('keeps the existing copy when the new download has no ai.json', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'scripts/check.sh': 'exit 0' });

         await loadConfigExtending(remote);
         remote.files = { 'README.md': 'Moved elsewhere' };

         await expect(loadConfigExtending(remote)).rejects.toThrow('No ai.json found in git repository');

         expect(existsSync(join(copyDir, 'scripts/check.sh'))).toStrictEqual(true);
      });

      it('drops files that the repository no longer contains', async () => {
         const remote = createRemote({ 'ai.json': '{}', 'rules/removed.md': 'Gone soon' });

         await loadConfigExtending(remote);
         remote.files = { 'ai.json': '{}' };
         await loadConfigExtending(remote);

         expect(existsSync(join(copyDir, 'rules/removed.md'))).toStrictEqual(false);
         expect(existsSync(join(copyDir, 'ai.json'))).toStrictEqual(true);
      });

      it('removes the copy of a config that is no longer extended', async () => {
         const OTHER_EXTENDS = 'github:org/other-config',
               remote = createRemote({ 'ai.json': '{}' });

         await loadConfigExtending(remote);
         await loadConfigExtending(remote, OTHER_EXTENDS);

         expect(existsSync(copyDir)).toStrictEqual(false);
         expect(existsSync(join(testDir, '.aix', 'extends', createDownloadKey(OTHER_EXTENDS), 'ai.json'))).toStrictEqual(true);
      });

      it('keeps the copy of a config that is no longer extended when the new load fails', async () => {
         const remote = createRemote({ 'ai.json': '{}' });

         await loadConfigExtending(remote);
         remote.offline = true;

         await expect(loadConfigExtending(remote, 'github:org/other-config')).rejects.toThrow('ENOTFOUND');

         expect(existsSync(join(copyDir, 'ai.json'))).toStrictEqual(true);
      });

      it('resolves a local extends inside the repository against the extends copy', async () => {
         const remote = createRemote({
            'ai.json': JSON.stringify({ extends: './base/ai.json' }),
            'base/ai.json': JSON.stringify({ rules: { style: './style.md' } }),
            'base/style.md': 'Use direct language.',
         });

         const result = await loadConfigExtending(remote);

         expect(result.rules).toEqual({ style: join(copyDir, 'base/style.md') });
      });

      it('points hook commands at scripts in the extends copy', async () => {
         const remote = createRemote({
            'ai.json': JSON.stringify({ hooks: { pre_command: [{ hooks: [{ command: './scripts/check.sh' }] }] } }),
            'scripts/check.sh': 'exit 0',
         });

         const result = await loadConfigExtending(remote);

         expect(result.hooks).toEqual({
            pre_command: [{ hooks: [{ command: `'${join(copyDir, 'scripts/check.sh')}'` }] }],
         });
      });
   });
});
