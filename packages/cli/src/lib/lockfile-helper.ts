import { existsSync } from 'node:fs';
import { dirname } from 'pathe';
import { generateAndWriteLockfile, getLockfilePath, loadConfig, type LoadedConfig } from '@a1st/aix-core';
import type { Output } from './output.js';

export function getLockableConfigPath(
   target: LoadedConfig | boolean | undefined,
   configPath?: string,
): string | undefined {
   if (typeof target === 'boolean') {
      if (target || !configPath) {
         return undefined;
      }
      return getLockfilePath(configPath) ? configPath : undefined;
   }

   if (!target) {
      return undefined;
   }

   return getLockfilePath(target.path) ? target.path : undefined;
}

export function shouldRefreshLockfile(
   flagsLock: boolean | undefined,
   configPath: string | undefined,
): boolean {
   if (!configPath) {
      return false;
   }

   if (flagsLock) {
      return true;
   }

   const lockPath = getLockfilePath(configPath);

   return Boolean(lockPath && existsSync(lockPath));
}

export async function refreshLockfileAfterRemoval(
   flagsLock: boolean | undefined,
   lockableConfigPath: string | undefined,
   output: Pick<Output, 'success'>,
): Promise<string | undefined> {
   if (!lockableConfigPath || !shouldRefreshLockfile(flagsLock, lockableConfigPath)) {
      return undefined;
   }

   const lockfilePath = await refreshLockfile(lockableConfigPath);

   output.success(`Updated ${lockfilePath}`);
   return lockfilePath;
}

export async function refreshLockfile(configPath: string): Promise<string> {
   const loaded = await loadConfig({
      startDir: dirname(configPath),
      lockfileMode: 'ignore',
   });

   if (!loaded || loaded.path !== configPath) {
      throw new Error(`Could not load ${configPath} after updating it.`);
   }

   const written = await generateAndWriteLockfile({
      config: loaded.config,
      configPath: loaded.path,
      configBaseDir: loaded.configBaseDir,
      projectRoot: dirname(loaded.path),
   });

   return written.lockfilePath;
}
