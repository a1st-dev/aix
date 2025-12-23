import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

/**
 * Zed prompts strategy. Zed uses a Rules Library UI, not file-based prompts.
 * Prompts are not supported in Zed at this time.
 */
export class ZedPromptsStrategy implements PromptsStrategy {
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
