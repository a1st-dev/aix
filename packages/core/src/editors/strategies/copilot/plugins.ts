import { parseJsonc, type PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';
import { getGlobalCopilotDir, LEGACY_COPILOT_DIR } from './paths.js';
import { getEnabledPlugins } from '../shared/declarative-plugins.js';

/**
 * GitHub Copilot plugins strategy. Formats agent plugins into `.github/copilot-plugins.json`
 * or the user-level `enabledPlugins` setting.
 */
export class CopilotPluginsStrategy implements PluginsStrategy {

   constructor(private readonly globalDir: string = getGlobalCopilotDir()) {}

   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '.github/copilot-plugins.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   getGlobalConfigPath(): string {
      return `${this.globalDir}/${this.globalDir === LEGACY_COPILOT_DIR ? 'plugins.json' : 'settings.json'}`;
   }

   formatConfig(plugins: PluginsConfig, targetScope: 'project' | 'user' = 'project'): string {
      if (targetScope === 'user') {
         return JSON.stringify({ enabledPlugins: getEnabledPlugins(plugins) }, null, 2) + '\n';
      }

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

   parseImportedConfig(content: string): { plugins: PluginsConfig; warnings: string[] } {
      const parsed = parseJsonc<{ enabledPlugins?: PluginsConfig; plugins?: PluginsConfig }>(content);

      return { plugins: parsed.data?.enabledPlugins ?? parsed.data?.plugins ?? {}, warnings: parsed.errors.map((error) => error.message) };
   }
}
