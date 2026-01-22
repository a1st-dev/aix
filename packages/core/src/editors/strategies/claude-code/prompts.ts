import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

/**
 * Claude Code prompts strategy. Uses markdown files with YAML frontmatter in `.claude/commands/`.
 * Supports `description` and `argument-hint` frontmatter fields.
 */
export class ClaudeCodePromptsStrategy implements PromptsStrategy {
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
      // Claude Code doesn't have global prompts
      return null;
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
      _files: string[],
      _readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      return { prompts: {}, warnings: [] };
   }

   /**
    * Detect if content appears to be in Claude Code's prompt frontmatter format.
    * Claude Code prompts use `allowed-tools:` or `context:` fields.
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n'),
            hasAllowedTools = parseYamlValue(lines, 'allowed-tools') !== undefined,
            hasContext = parseYamlValue(lines, 'context') !== undefined;

      return hasAllowedTools || hasContext;
   }

   /**
    * Parse Claude Code-specific frontmatter into unified format.
    * Extracts `description` and `argument-hint` fields.
    */
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
