import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

   it('installs a versioned package through the runtime adapter and returns the cache path', async () => {
      const ensureDependencyInstalled = vi.fn(async () => {
               return undefined;
            }),
            adapter = createRuntimeAdapter({
               npm: {
                  ...nodeRuntimeAdapter.npm,
                  ensureDependencyInstalled,
               },
            });

      const result = await withRuntimeAdapter(adapter, async () => {
         return resolveNpmPath({
            packageName: '@company/rules',
            version: '^1.0.0',
            projectRoot,
         });
      });

      expect(ensureDependencyInstalled).toHaveBeenCalledWith('@company/rules@^1.0.0', join(projectRoot, '.aix'));
      expect(result).toBe(join(projectRoot, '.aix', '.tmp', 'node_modules', '@company/rules'));
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
