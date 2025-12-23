import pMap from 'p-map';
import { platform } from 'node:os';
import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

/**
 * VS Code prompts strategy. Uses markdown files with YAML frontmatter in `.github/prompts/`.
 * Files use `.prompt.md` extension. Supports `description` and `argument-hint` frontmatter fields.
 */
export class VSCodePromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      // VS Code prompt files go in .github/prompts/, not in .vscode/
      return '../.github/prompts';
   }

   getFileExtension(): string {
      return '.prompt.md';
   }

   getGlobalPromptsPath(): string | null {
      const paths: Record<string, string> = {
         darwin: 'Library/Application Support/Code/User/prompts',
         linux: '.config/Code/User/prompts',
         win32: 'AppData/Roaming/Code/User/prompts',
      };

      return paths[platform()] ?? null;
   }

   formatPrompt(prompt: EditorPrompt): string {
      const frontmatter: Record<string, string> = {};

      if (prompt.description) {
         frontmatter.description = prompt.description;
      }

      if (prompt.argumentHint) {
         frontmatter['argument-hint'] = prompt.argumentHint;
      }

      const lines: string[] = [];

      if (Object.keys(frontmatter).length > 0) {
         lines.push('---');
         for (const [key, value] of Object.entries(frontmatter)) {
            lines.push(`${key}: ${value}`);
         }
         lines.push('---', '');
      }

      lines.push(prompt.content);
      return lines.join('\n');
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      const mdFiles = files.filter((f) => f.endsWith('.md') && !f.endsWith('.instructions.md'));

      type ParseResult =
         | { type: 'prompt'; name: string; content: string }
         | { type: 'warning'; message: string }
         | null;

      const results: ParseResult[] = await pMap(
         mdFiles,
         async (file): Promise<ParseResult> => {
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
         },
         { concurrency: 5 },
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
