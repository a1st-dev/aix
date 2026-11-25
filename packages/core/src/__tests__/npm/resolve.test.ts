import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'pathe';
import { UnsupportedRuntimeCapabilityError } from '../../errors.js';
import { safeRm } from '../../fs/safe-rm.js';
import { resolveNpmPath } from '../../npm/resolve.js';
import {
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../../runtime/index.js';

describe('resolveNpmPath', () => {
   const projectRoot = '/test/project';

   afterEach(() => {
      resetRuntimeAdapter();
   });

   it('uses the runtime adapter to resolve installed packages', async () => {
      const resolvePackagePath = vi.fn(async () => {
               return '/test/project/node_modules/@company/rules/package.json';
            }),
            adapter = createRuntimeAdapter({
               npm: {
                  ...nodeRuntimeAdapter.npm,
                  resolvePackagePath,
               },
            });

      const result = await withRuntimeAdapter(adapter, async () => {
         return resolveNpmPath({
            packageName: '@company/rules',
            projectRoot,
         });
      });

      expect(resolvePackagePath).toHaveBeenCalledWith('@company/rules', projectRoot, 'package.json');
      expect(result).toBe('/test/project/node_modules/@company/rules');
   });

   it('resolves installed packages from the requested project root', async () => {
      const testDir = join(tmpdir(), `aix-npm-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`),
            packageRoot = join(testDir, 'node_modules', '@company', 'hooks');

      await mkdir(join(packageRoot, 'hooks'), { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), '{"name":"@company/hooks"}', 'utf-8');
      await writeFile(join(packageRoot, 'hooks', 'pre-command.jsonc'), '{}', 'utf-8');

      try {
         const result = await resolveNpmPath({
            packageName: '@company/hooks',
            subpath: 'hooks/pre-command.jsonc',
            projectRoot: testDir,
         });

         expect(result).toMatch(/node_modules\/@company\/hooks\/hooks\/pre-command\.jsonc$/);
      } finally {
         await safeRm(testDir, { force: true });
      }
   });

   it('throws a helpful error when an installed package cannot be resolved', async () => {
      const adapter = createRuntimeAdapter({
         npm: {
            ...nodeRuntimeAdapter.npm,
            resolvePackagePath: async () => {
               throw new Error('Cannot find package');
            },
         },
      });

      await expect(
         withRuntimeAdapter(adapter, async () => {
            return resolveNpmPath({
               packageName: 'missing-pkg',
               projectRoot,
            });
         }),
      ).rejects.toThrow('add a "version" field to auto-install');
   });

   describe('with a version', () => {
      let tempProjectRoot: string;

      beforeEach(async () => {
         tempProjectRoot = join(tmpdir(), `aix-test-npm-resolve-${Date.now()}-${Math.random().toString(36).slice(2)}`);
         await mkdir(tempProjectRoot, { recursive: true });
      });

      afterEach(async () => {
         await safeRm(tempProjectRoot, { force: true });
      });

      function resolveVersioned(ensureDependencyInstalled: RuntimeAdapter['npm']['ensureDependencyInstalled']): Promise<string> {
         const adapter = createRuntimeAdapter({
            npm: { ...nodeRuntimeAdapter.npm, ensureDependencyInstalled },
         });

         return withRuntimeAdapter(adapter, async () => {
            return resolveNpmPath({
               packageName: '@company/rules',
               subpath: 'rules/style.md',
               version: '^1.0.0',
               projectRoot: tempProjectRoot,
            });
         });
      }

      it('installs the package in the directory it is then read from', async () => {
         const installs: Array<{ packageSpec: string; cwd: string }> = [];

         const result = await resolveVersioned(async (packageSpec, cwd) => {
            installs.push({ packageSpec, cwd });
         });

         expect(installs).toEqual([{ packageSpec: '@company/rules@^1.0.0', cwd: join(tempProjectRoot, '.aix', '.tmp') }]);
         expect(result).toBe(join(installs[0]?.cwd ?? '', 'node_modules', '@company/rules', 'rules/style.md'));
      });

      it('gives the install directory its own package.json so npm does not install into the project', async () => {
         let packageJsonAtInstall = '';

         await resolveVersioned(async (_packageSpec, cwd) => {
            packageJsonAtInstall = await readFile(join(cwd, 'package.json'), 'utf-8');
         });

         expect(JSON.parse(packageJsonAtInstall)).toEqual({ private: true });
      });

      it('keeps the package.json that an earlier install updated', async () => {
         const installRoot = join(tempProjectRoot, '.aix', '.tmp'),
               existing = '{ "private": true, "dependencies": { "@company/prompts": "^2.0.0" } }';

         await mkdir(installRoot, { recursive: true });
         await writeFile(join(installRoot, 'package.json'), existing, 'utf-8');

         await resolveVersioned(async () => {
            return undefined;
         });

         expect(await readFile(join(installRoot, 'package.json'), 'utf-8')).toBe(existing);
      });
   });

   it('preserves unsupported runtime capability errors', async () => {
      const adapter = createRuntimeAdapter({
         npm: {
            ...nodeRuntimeAdapter.npm,
            resolvePackagePath: async () => {
               throw new UnsupportedRuntimeCapabilityError('npm-resolution', 'resolving npm package paths');
            },
         },
      });

      await expect(
         withRuntimeAdapter(adapter, async () => {
            return resolveNpmPath({
               packageName: '@company/rules',
               projectRoot,
            });
         }),
      ).rejects.toThrow('Missing capability: npm-resolution');
   });
});

function createRuntimeAdapter(overrides: Partial<RuntimeAdapter>): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      ...overrides,
   };
}
