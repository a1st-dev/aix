import { join } from 'pathe';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import type { HooksStrategy } from '../types.js';

/**
 * Whether the editor keeps a hooks config file at the given scope. An editor can support
 * hooks in general but only in one scope: Claude Code reads both `.claude/settings.json`
 * and `~/.claude/settings.json`, while an editor with only a user-level hooks file has
 * nowhere to put project hooks.
 */
export function hasHooksConfigPath(
   strategy: HooksStrategy,
   targetScope: 'project' | 'user',
): boolean {
   if (!strategy.isSupported()) {
      return false;
   }

   return Boolean(
      targetScope === 'user' ? strategy.getGlobalConfigPath() : strategy.getConfigPath(),
   );
}

/**
 * Resolve where an editor keeps its hooks config for the requested scope, or `undefined`
 * when it has no hooks file at that scope. Callers must not fall back to the other scope:
 * writing project hooks into the user's home directory (or the reverse) puts them where
 * the editor will not read them, and silently widens their reach.
 */
export function resolveHooksConfigPath(
   strategy: HooksStrategy,
   configDir: string,
   targetScope: 'project' | 'user',
): string | undefined {
   if (!hasHooksConfigPath(strategy, targetScope)) {
      return undefined;
   }

   if (targetScope === 'user') {
      return join(getRuntimeAdapter().os.homedir(), String(strategy.getGlobalConfigPath()));
   }

   return join(configDir, strategy.getConfigPath());
}
