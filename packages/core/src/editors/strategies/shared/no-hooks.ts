import type { HooksConfig } from '@a1st/aix-schema';
import type { HooksStrategy } from '../types.js';

/**
 * No-op hooks strategy for editors that don't support hooks.
 * Returns unsupported for all hook events.
 */
export class NoHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return false;
   }

   getConfigPath(): string {
      return '';
   }

   getGlobalConfigPath(): string | null {
      return null;
   }

   formatConfig(_hooks: HooksConfig): string {
      return '';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks);
   }
}
