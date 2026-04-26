import { dirname, join } from 'pathe';
import { getAixDir, getNpmCacheDir } from '../cache/paths.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { getRuntimeAdapter } from '../runtime/index.js';

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
      const aixDir = getAixDir(projectRoot),
            packageSpec = `${packageName}@${version}`;

      await getRuntimeAdapter().npm.ensureDependencyInstalled(packageSpec, aixDir);

      const cachedRoot = join(getNpmCacheDir(projectRoot), packageName);

      return subpath ? join(cachedRoot, subpath) : cachedRoot;
   }

   try {
      const packageRoot = await resolveInstalledPackageRoot(packageName, projectRoot);

      return subpath ? join(packageRoot, subpath) : packageRoot;
   } catch (error) {
      if (error instanceof UnsupportedRuntimeCapabilityError) {
         throw error;
      }
      throw new Error(
         `Package "${packageName}" not found in node_modules. ` +
            'Either install it via npm/yarn/pnpm, or add a "version" field to auto-install.',
         { cause: error },
      );
   }
}

/**
 * Find package root by resolving package.json
 */
async function resolveInstalledPackageRoot(
   packageName: string,
   projectRoot: string,
): Promise<string> {
   const packageJsonPath = await getRuntimeAdapter().npm.resolvePackagePath(packageName, projectRoot, 'package.json');

   return dirname(packageJsonPath);
}
