import pMap from 'p-map';
import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

/**
 * OpenCode custom commands are markdown files in `.opencode/commands/` or
 * `~/.config/opencode/commands/`. The file body is the command template.
 */
export class OpenCodePromptsStrategy implements PromptsStrategy {
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
      return '.config/opencode/commands';
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
            lines.push(`${key}: ${JSON.stringify(value)}`);
         }
         lines.push('---', '');
      }

      lines.push(prompt.content);
      return lines.join('\n') + '\n';
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

      const results = await pMap(
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

   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      return frontmatter.split('\n').some((line) => /^description\s*:/.test(line));
   }

   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent };
      }

      const lines = frontmatter.split('\n'),
            description = parseYamlValue(lines, 'description') as string | undefined,
            argumentHint = parseYamlValue(lines, 'argument-hint') as string | undefined;

      return {
         content,
         description,
         argumentHint,
      };
   }
}
