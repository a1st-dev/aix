import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

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
      const lines: string[] = [],
            contentStartsWithHeading = /^#\s/.test(prompt.content.trim());

      // Only add heading if content doesn't already start with one
      if (!contentStartsWithHeading) {
         lines.push(`# ${prompt.name}`, '');
      }

      // Include description as a paragraph if present (only if we added a heading)
      if (prompt.description && !contentStartsWithHeading) {
         lines.push(prompt.description, '');
      }

      lines.push(prompt.content);
      return lines.join('\n');
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      type ParseResult =
         | { type: 'prompt'; name: string; content: string }
         | { type: 'warning'; message: string }
         | null;

      const results: ParseResult[] = await Promise.all(
         mdFiles.map(async (file): Promise<ParseResult> => {
            try {
               const content = await readFile(file);

               if (content.trim()) {
                  return {
                     type: 'prompt',
                     name: file.replace(/\.md$/, ''),
                     content: content.trim(),
                  };
               }
               return null;
            } catch (err) {
               return {
                  type: 'warning',
                  message: `Failed to read prompt ${file}: ${(err as Error).message}`,
               };
            }
         }),
      );

      const prompts: Record<string, string> = {},
            warnings: string[] = [];

      for (const result of results) {
         if (!result) {
            continue;
         }
         if (result.type === 'warning') {
            warnings.push(result.message);
         } else {
            prompts[result.name] = result.content;
         }
      }

      return { prompts, warnings };
   }
}
