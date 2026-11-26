import { parseJsonc, type PluginsConfig } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';
import { getEnabledPlugins } from '../shared/declarative-plugins.js';

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
      return JSON.stringify({ enabledPlugins: getEnabledPlugins(plugins) }, null, 2) + '\n';
   }

   getUnsupportedPlugins(_plugins: PluginsConfig): string[] {
      return [];
   }

   parseImportedConfig(content: string): { plugins: PluginsConfig; warnings: string[] } {
      const parsed = parseJsonc<{ enabledPlugins?: PluginsConfig }>(content);

      return { plugins: parsed.data?.enabledPlugins ?? {}, warnings: parsed.errors.map((error) => error.message) };
   }
}
