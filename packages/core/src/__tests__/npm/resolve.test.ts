import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveNpmPath } from '../../npm/resolve.js';
import { join } from 'pathe';

// Mock the cache paths module
vi.mock('../../cache/paths.js', () => ({
   getAixDir: (root: string) => join(root, '.aix'),
   getNpmCacheDir: (root: string) => join(root, '.aix', '.tmp', 'node_modules'),
}));

// Mock nypm
vi.mock('nypm', () => ({
   ensureDependencyInstalled: vi.fn().mockResolvedValue(undefined),
}));

describe('resolveNpmPath', () => {
   const projectRoot = '/test/project';

   beforeEach(() => {
      vi.clearAllMocks();
   });

   afterEach(() => {
      vi.restoreAllMocks();
   });

   describe('without version (node_modules mode)', () => {
      it('throws when package not found in node_modules', async () => {
         await expect(
            resolveNpmPath({
               packageName: '@nonexistent/package',
               projectRoot,
            }),
         ).rejects.toThrow('not found in node_modules');
      });

      it('includes helpful message about version field', async () => {
         await expect(
            resolveNpmPath({
               packageName: 'missing-pkg',
               projectRoot,
            }),
         ).rejects.toThrow('add a "version" field to auto-install');
      });
   });

   describe('with version (auto-install mode)', () => {
      it('installs package to cache and returns path', async () => {
         const { ensureDependencyInstalled } = await import('nypm');

         const result = await resolveNpmPath({
            packageName: '@company/rules',
            version: '^1.0.0',
            projectRoot,
         });

         expect(ensureDependencyInstalled).toHaveBeenCalledWith('@company/rules@^1.0.0', {
            cwd: join(projectRoot, '.aix'),
         });
         expect(result).toBe(join(projectRoot, '.aix', '.tmp', 'node_modules', '@company/rules'));
      });

      it('appends subpath to cached package root', async () => {
         const result = await resolveNpmPath({
            packageName: '@company/rules',
            subpath: 'rules/style.md',
            version: '1.0.0',
            projectRoot,
         });

         expect(result).toBe(
            join(projectRoot, '.aix', '.tmp', 'node_modules', '@company/rules', 'rules/style.md'),
         );
      });
   });

});
