import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';
import { formatPromptFile, parsePromptFiles } from '../shared/prompt-utils.js';

/**
 * Cursor prompts strategy. Uses plain markdown files in `.cursor/commands/`.
 * Cursor commands don't support frontmatter - just plain markdown content.
 */
export class CursorPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      return 'commands';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string | null {
      return '.cursor/commands';
   }

   formatPrompt(prompt: EditorPrompt): string {
      return formatPromptFile(prompt, {
         includeHeading: true,
         includeDescriptionParagraph: true,
      });
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      return parsePromptFiles({
         files,
         readFile,
         includeFile: (file) => file.endsWith('.md'),
         stripSuffix: /\.md$/,
      });
   }
}
