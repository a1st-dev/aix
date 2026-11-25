import { dirname, join } from 'pathe';
import { getNpmCacheDir } from '../cache/paths.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { getRuntimeAdapter } from '../runtime/index.js';

const INSTALL_ROOT_PACKAGE_JSON = { private: true };

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
      const cacheDir = getNpmCacheDir(projectRoot),
            installRoot = dirname(cacheDir),
            packageSpec = `${packageName}@${version}`;

      await ensureInstallRoot(installRoot);
      await getRuntimeAdapter().npm.ensureDependencyInstalled(packageSpec, installRoot);

      const cachedRoot = join(cacheDir, packageName);

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
 * Make `installRoot` a package root of its own. npm installs into the nearest ancestor that
 * has a package.json, so without one here an auto-installed package would land in the user's
 * project (and be added to its package.json) instead of in the cache it is then read from.
 */
async function ensureInstallRoot(installRoot: string): Promise<void> {
   const { fs } = getRuntimeAdapter(),
         packageJsonPath = join(installRoot, 'package.json');

   if (fs.existsSync(packageJsonPath)) {
      return;
   }

   await fs.mkdir(installRoot, { recursive: true });
   await fs.writeFile(packageJsonPath, `${JSON.stringify(INSTALL_ROOT_PACKAGE_JSON, null, 2)}\n`, 'utf-8');
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
