import type { PromptsStrategy, ParsedPromptFrontmatter } from '../types.js';
import type { EditorPrompt } from '../../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

/**
 * Kiro prompts strategy - converts prompts to manual-inclusion steering files.
 * Prompts appear as slash commands in Kiro's chat interface.
 */
export class KiroPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   isGlobalOnly(): boolean {
      return false;
   }

   getPromptsDir(): string {
      return 'steering';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string | null {
      return '.kiro/steering';
   }

   formatPrompt(prompt: EditorPrompt): string {
      const lines: string[] = ['---'];

      // Prompts always use manual inclusion (slash commands)
      lines.push('inclusion: manual');

      if (prompt.description) {
         lines.push(`description: "${prompt.description}"`);
      }

      if (prompt.argumentHint) {
         lines.push(`argumentHint: "${prompt.argumentHint}"`);
      }

      lines.push('---', '');
      lines.push(prompt.content);
      return lines.join('\n');
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      const prompts: Record<string, string> = {};
      const warnings: string[] = [];

      // Process all files in parallel
      const fileOperations = files
         .filter(file => file.endsWith('.md'))
         .map(async (file) => {
            try {
               const content = await readFile(file);
               const { frontmatter, content: body, hasFrontmatter } = extractFrontmatter(content);

               if (!hasFrontmatter) {
                  return null;
               }

               const lines = frontmatter.split('\n');
               const inclusion = parseYamlValue(lines, 'inclusion') as string | undefined;

               // Only include manual-inclusion files (prompts)
               if (inclusion === 'manual') {
                  const name = file.replace(/\.md$/, '').replace(/^prompt-/, '');

                  return { type: 'success' as const, name, body };
               }

               return null;
            } catch (err) {
               return { type: 'error' as const, error: `Failed to parse prompt ${file}: ${(err as Error).message}` };
            }
         });

      const results = await Promise.all(fileOperations);

      for (const result of results) {
         if (result === null) {
            continue;
         }

         if (result.type === 'error') {
            warnings.push(result.error);
         } else {
            prompts[result.name] = result.body;
         }
      }

      return { prompts, warnings };
   }

   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');
      const inclusion = parseYamlValue(lines, 'inclusion') as string | undefined;

      return inclusion === 'manual';
   }

   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent };
      }

      const lines = frontmatter.split('\n');
      const description = parseYamlValue(lines, 'description') as string | undefined;
      const argumentHint = parseYamlValue(lines, 'argumentHint') as string | undefined;

      return {
         content,
         description,
         argumentHint,
      };
   }
}
