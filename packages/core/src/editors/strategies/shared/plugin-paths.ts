import { join } from 'pathe';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import type { PluginsStrategy, MarketplacesStrategy } from '../types.js';

/**
 * Resolve where an editor keeps its plugins config for the requested scope, or `undefined`
 * if it has no plugins config file at that scope.
 */
export function resolvePluginsConfigPath(
   strategy: PluginsStrategy,
   configDir: string,
   targetScope: 'project' | 'user',
   projectRoot?: string,
): string | undefined {
   if (!strategy.isSupported()) {
      return undefined;
   }

   if (targetScope === 'user') {
      const globalPath = strategy.getGlobalConfigPath?.();

      return globalPath ? join(getRuntimeAdapter().os.homedir(), globalPath) : undefined;
   }

   const relPath = strategy.getConfigPath?.(targetScope);

   if (!relPath) {
      return undefined;
   }

   const baseDir = strategy.isProjectRootConfig?.() && projectRoot ? projectRoot : configDir;

   return join(baseDir, relPath);
}

/**
 * Resolve where an editor keeps its marketplace config for the requested scope, or `undefined`
 * if it has no marketplace config file at that scope.
 */
export function resolveMarketplacesConfigPath(
   strategy: MarketplacesStrategy,
   configDir: string,
   targetScope: 'project' | 'user',
   projectRoot?: string,
): string | undefined {
   if (!strategy.isSupported()) {
      return undefined;
   }

   if (targetScope === 'user') {
      const globalPath = strategy.getGlobalConfigPath?.();

      return globalPath ? join(getRuntimeAdapter().os.homedir(), globalPath) : undefined;
   }

   const relPath = strategy.getConfigPath?.(targetScope);

   if (!relPath) {
      return undefined;
   }

   const baseDir = strategy.isProjectRootConfig?.() && projectRoot ? projectRoot : configDir;

   return join(baseDir, relPath);
}

/**
 * Whether the editor supports plugins config at the requested scope.
 */
export function hasPluginsConfigPath(
   strategy: PluginsStrategy,
   targetScope: 'project' | 'user',
): boolean {
   if (!strategy.isSupported()) {
      return false;
   }

   if (strategy.isCompatibility?.()) {
      return targetScope === 'project';
   }

   return Boolean(
      targetScope === 'user' ? strategy.getGlobalConfigPath?.() : strategy.getConfigPath?.(targetScope),
   );
}

/**
 * Whether the editor supports marketplace config at the requested scope.
 */
export function hasMarketplacesConfigPath(
   strategy: MarketplacesStrategy,
   targetScope: 'project' | 'user',
): boolean {
   if (!strategy.isSupported()) {
      return false;
   }

   return Boolean(
      targetScope === 'user' ? strategy.getGlobalConfigPath?.() : strategy.getConfigPath?.(targetScope),
   );
}
