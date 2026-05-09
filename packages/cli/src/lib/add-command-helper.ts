import { getLocalConfigPath, type ConfigSection, type LoadedConfig } from '@a1st/aix-core';
import type { Package } from '@a1st/mcp-registry-client';
import type { ConfigScope, McpServerConfig } from '@a1st/aix-schema';
import { refreshLockfile } from './lockfile-helper.js';
import { formatInstallResults, installAfterAdd, installSingleItem } from './install-helper.js';
import type { Output } from './output.js';

export interface PersistAddedItemOptions {
   loaded?: LoadedConfig;
   local: boolean;
   output: Pick<Output, 'info' | 'success'>;
   localSuccessMessage: string;
   projectSuccessMessage: string;
   saveLocal: (path: string) => Promise<void>;
   saveProject: (path: string) => Promise<void>;
}

export interface InstallAddedItemOptions {
   logInstallResults: (results: Array<{ message: string; success: boolean }>) => void;
   skipInstall: boolean;
   loaded?: LoadedConfig;
   local: boolean;
   installSections: ConfigSection[];
   itemSection: ConfigSection;
   itemName: string;
   itemValue: unknown;
   scope: ConfigScope;
   projectRoot: string;
}

export async function persistAddedItem(options: PersistAddedItemOptions): Promise<void> {
   const {
      loaded,
      local,
      output,
      localSuccessMessage,
      projectSuccessMessage,
      saveLocal,
      saveProject,
   } = options;

   if (local) {
      const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

      await saveLocal(localPath);
      output.success(localSuccessMessage);
      return;
   }

   if (loaded) {
      await saveProject(loaded.path);
      output.success(projectSuccessMessage);
      return;
   }

   output.info('No ai.json found — installing directly to editors');
}

export async function refreshLockfileAfterAdd(
   shouldRefresh: boolean,
   lockableConfigPath: string | undefined,
   output: Pick<Output, 'success'>,
): Promise<string | undefined> {
   if (!shouldRefresh || !lockableConfigPath) {
      return undefined;
   }

   const lockfilePath = await refreshLockfile(lockableConfigPath);

   output.success(`Updated ${lockfilePath}`);
   return lockfilePath;
}

export async function installAddedItem(options: InstallAddedItemOptions): Promise<void> {
   const {
      logInstallResults,
      skipInstall,
      loaded,
      local,
      installSections,
      itemSection,
      itemName,
      itemValue,
      scope,
      projectRoot,
   } = options;

   if (skipInstall) {
      return;
   }

   const installResult = loaded && !local
      ? await installAfterAdd({
         configPath: loaded.path,
         sections: installSections,
         scope,
      })
      : await installSingleItem({
         section: itemSection,
         name: itemName,
         value: itemValue,
         scope,
         projectRoot,
      });

   if (installResult.installed) {
      logInstallResults(formatInstallResults(installResult.results));
   }
}

export function findCompatibleNpmPackage(packages: Package[] | null | undefined): Package | undefined {
   if (!packages) {
      return undefined;
   }

   return packages.find((pkg) => pkg.registryType === 'npm' && pkg.transport.type === 'stdio');
}

export function buildMcpServerConfig(pkg: Package): McpServerConfig {
   const env: Record<string, string> = {};

   for (const envVar of pkg.environmentVariables ?? []) {
      if (envVar.default) {
         env[envVar.name] = envVar.default;
      } else if (envVar.isRequired) {
         env[envVar.name] = envVar.isSecret ? '<YOUR_SECRET>' : '<REQUIRED>';
      }
   }

   return Object.keys(env).length > 0
      ? {
         command: `npx ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}`,
         env,
      }
      : {
         command: `npx ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}`,
      };
}
