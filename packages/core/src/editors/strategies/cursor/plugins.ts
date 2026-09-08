import type { PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';

/**
 * Cursor plugins strategy. Formats plugins into `.cursor-plugin/plugin.json`.
 */
export class CursorPluginsStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '.cursor-plugin/plugin.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   formatConfig(plugins: PluginsConfig): string {
      const activePlugins: Record<string, boolean | Record<string, unknown>> = {};

      for (const [ key, value ] of Object.entries(plugins)) {
         if (value === false) {
            activePlugins[key] = false;
         } else if (value === true || typeof value === 'string') {
            activePlugins[key] = true;
         } else if (typeof value === 'object' && value !== null) {
            activePlugins[key] = {
               enabled: value.enabled !== false,
               ...(value.options ? { options: value.options } : {}),
            };
         }
      }

      return JSON.stringify({ plugins: activePlugins }, null, 2) + '\n';
   }

   getUnsupportedPlugins(_plugins: PluginsConfig): string[] {
      return [];
   }
}
