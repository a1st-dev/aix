import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import {
   formatPromptFile,
   hasPromptFrontmatterFields,
   parsePromptFiles,
   parsePromptFrontmatter,
} from '../shared/prompt-utils.js';

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
      return '.claude/commands';
   }

   formatPrompt(prompt: EditorPrompt): string {
      return formatPromptFile(prompt, {
         frontmatterFields: [
            { key: 'description', value: prompt.description },
            { key: 'argument-hint', value: prompt.argumentHint },
         ],
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

   /**
    * Detect if content appears to be in Claude Code's prompt frontmatter format.
    * Claude Code prompts use `allowed-tools:` or `context:` fields.
    */
   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['allowed-tools', 'context']);
   }

   /**
    * Parse Claude Code-specific frontmatter into unified format.
    * Extracts `description` and `argument-hint` fields.
    */
   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description', 'argument-hint']);
   }
}
