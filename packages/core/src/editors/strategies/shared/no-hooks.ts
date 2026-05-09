import type { HooksConfig } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';

/**
 * No-op hooks strategy for editors that don't support hooks. Reports every supplied
 * event as unsupported and returns empty arrays everywhere else.
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

   getUnsupportedFields(_hooks: HooksConfig): UnsupportedHookField[] {
      return [];
   }

   getSupportedEvents(): readonly string[] {
      return [];
   }

   getNativeEventNames(): readonly string[] {
      return [];
   }

   parseImportedConfig(_content: string): ParsedHooksImportResult {
      return { hooks: {}, warnings: [] };
   }
}
