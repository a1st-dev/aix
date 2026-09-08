import type { PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';

/**
 * Claude Code plugins strategy. Formats plugins into Claude Code's `enabledPlugins`
 * map in `.claude/settings.json` (or `~/.claude/settings.json`).
 */
export class ClaudeCodePluginsStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getGlobalConfigPath(): string {
      return '.claude/settings.json';
   }

   formatConfig(plugins: PluginsConfig): string {
      const enabledPlugins: Record<string, boolean> = {};

      for (const [ key, value ] of Object.entries(plugins)) {
         if (value === false) {
            enabledPlugins[key] = false;
         } else if (value === true || typeof value === 'string') {
            enabledPlugins[key] = true;
         } else if (typeof value === 'object' && value !== null) {
            const pluginKey = !key.includes('@') && value.marketplace
               ? `${key}@${value.marketplace}`
               : key;

            enabledPlugins[pluginKey] = value.enabled !== false;
         }
      }

      return JSON.stringify({ enabledPlugins }, null, 2) + '\n';
   }

   getUnsupportedPlugins(_plugins: PluginsConfig): string[] {
      return [];
   }
}
