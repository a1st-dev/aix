import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

/**
 * No-op prompts strategy for editors that don't support prompts/commands (e.g., Zed).
 */
export class NoPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return false;
   }

   getPromptsDir(): string {
      return '';
   }

   getFileExtension(): string {
      return '';
   }

   getGlobalPromptsPath(): string | null {
      return null;
   }

   formatPrompt(_prompt: EditorPrompt): string {
      return '';
   }

   async parseGlobalPrompts(
      _files: string[],
      _readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      return { prompts: {}, warnings: [] };
   }
}
