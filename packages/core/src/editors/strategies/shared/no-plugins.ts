import type { PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';

/**
 * No-op plugins strategy for editors that don't support plugins. Reports every
 * supplied plugin as unsupported.
 */
export class NoPluginsStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return false;
   }

   formatConfig(_plugins: PluginsConfig): string {
      return '';
   }

   getConfigPath(): string {
      return '';
   }

   getUnsupportedPlugins(plugins: PluginsConfig): string[] {
      return Object.keys(plugins);
   }
}
