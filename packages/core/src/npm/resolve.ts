import { dirname, join } from 'pathe';
import { fileURLToPath } from 'node:url';
import { ensureDependencyInstalled } from 'nypm';
import { getAixDir, getNpmCacheDir } from '../cache/paths.js';

export interface NpmResolveOptions {
   packageName: string;
   subpath?: string;
   version?: string; // If present, auto-install; if absent, require node_modules
   projectRoot: string;
}

/**
 * Resolve a path within an npm package.
 * Returns the absolute filesystem path.
 *
 * Resolution modes:
 * - No version: Resolve from project's node_modules only (error if not found)
 * - With version: Auto-install to .aix/.tmp/node_modules cache
 */
export async function resolveNpmPath(options: NpmResolveOptions): Promise<string> {
   const { packageName, subpath, version, projectRoot } = options;

   if (version) {
      // Auto-install mode: install specific version to cache
      const aixDir = getAixDir(projectRoot),
            packageSpec = `${packageName}@${version}`;

      await ensureDependencyInstalled(packageSpec, { cwd: aixDir });

      const cachedRoot = join(getNpmCacheDir(projectRoot), packageName);

      return subpath ? join(cachedRoot, subpath) : cachedRoot;
   }

   // Node modules mode: require package to be installed
   const packageRoot = await tryFindPackageRoot(packageName, projectRoot);

   if (!packageRoot) {
      throw new Error(
         `Package "${packageName}" not found in node_modules. ` +
            'Either install it via npm/yarn/pnpm, or add a "version" field to auto-install.',
      );
   }
   return subpath ? join(packageRoot, subpath) : packageRoot;
}

/**
 * Find package root by resolving package.json
 */
async function tryFindPackageRoot(
   packageName: string,
   projectRoot: string,
): Promise<string | undefined> {
   try {
      const pkgJsonPath = import.meta.resolve(`${packageName}/package.json`, `file://${projectRoot}/`);

      return dirname(fileURLToPath(pkgJsonPath));
   } catch {
      return undefined;
   }
}
