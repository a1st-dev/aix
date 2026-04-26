import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'pathe';
import { UnsupportedRuntimeCapabilityError } from '../../errors.js';
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
