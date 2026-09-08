import type { PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';

/**
 * OpenCode plugins strategy. Formats active plugins as a `plugins` string array
 * in `opencode.json` (or `~/.config/opencode/opencode.json`).
 */
export class OpenCodePluginsStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'opencode.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   getGlobalConfigPath(): string {
      return '.config/opencode/opencode.json';
   }

   formatConfig(plugins: PluginsConfig): string {
      const activePlugins: string[] = [];

      for (const [ key, value ] of Object.entries(plugins)) {
         if (value === false) {
            continue;
         }

         if (value === true) {
            // Strip any @marketplace suffix since OpenCode loads npm packages or local paths.
            // Search from index 1 so leading '@' in scoped packages (@scope/pkg) is preserved.
            const atIndex = key.indexOf('@', 1),
                  normalized = atIndex > 0 ? key.slice(0, atIndex) : key;

            activePlugins.push(normalized);
         } else if (typeof value === 'string') {
            activePlugins.push(value);
         } else if (typeof value === 'object' && value !== null) {
            if (value.enabled === false) {
               continue;
            }

            if (typeof value.source === 'string') {
               activePlugins.push(value.source);
            } else {
               const atIndex = key.indexOf('@', 1),
                     normalized = atIndex > 0 ? key.slice(0, atIndex) : key;

               activePlugins.push(normalized);
            }
         }
      }

      return JSON.stringify({ plugins: activePlugins }, null, 2) + '\n';
   }

   getUnsupportedPlugins(_plugins: PluginsConfig): string[] {
      return [];
   }
}
