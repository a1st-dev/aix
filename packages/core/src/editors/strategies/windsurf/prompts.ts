import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

/**
 * Windsurf prompts strategy. Uses markdown files with YAML frontmatter in `.windsurf/workflows/`.
 * Supports `description` frontmatter field.
 */
export class WindsurfPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      return 'workflows';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string | null {
      return '.codeium/windsurf/global_workflows';
   }

   formatPrompt(prompt: EditorPrompt): string {
      const lines: string[] = ['---'];

      if (prompt.description) {
         lines.push(`description: ${prompt.description}`);
      }

      lines.push('---', '');

      // Only add heading if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(prompt.content.trim());

      if (!contentStartsWithHeading) {
         lines.push(`# ${prompt.name}`, '');
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
