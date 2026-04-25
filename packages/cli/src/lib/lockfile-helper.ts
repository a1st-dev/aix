import { dirname } from 'pathe';
import { generateAndWriteLockfile, getLockfilePath, loadConfig, type LoadedConfig } from '@a1st/aix-core';

export function getLockableConfigPath(loaded: LoadedConfig | undefined): string | undefined {
   if (!loaded) {
      return undefined;
   }

   return getLockfilePath(loaded.path) ? loaded.path : undefined;
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
