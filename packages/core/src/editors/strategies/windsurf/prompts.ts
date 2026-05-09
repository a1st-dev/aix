import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import {
   formatPromptFile,
   hasPromptFrontmatterFields,
   parsePromptFiles,
   parsePromptFrontmatter,
} from '../shared/prompt-utils.js';

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
      return formatPromptFile(prompt, {
         frontmatterFields: [{ key: 'description', value: prompt.description }],
         alwaysIncludeFrontmatter: true,
         includeHeading: true,
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
    * Detect if content appears to be in Windsurf's workflow frontmatter format.
    * Windsurf workflows use `description:` in frontmatter (but not rules-specific fields like `trigger`).
    */
   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['description'], ['trigger']);
   }

   /**
    * Parse Windsurf-specific frontmatter into unified format.
    * Only extracts `description` field.
    */
   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description']);
   }
}
