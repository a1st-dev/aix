import type { HooksConfig } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * No-op hooks strategy for editors that don't support hooks (VS Code, Zed, Codex).
 * Returns unsupported for all hook events.
 */
export class NoHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return false;
   }

   getConfigPath(): string {
      return '';
   }

   formatConfig(_hooks: HooksConfig): string {
      return '';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks);
   }
}
