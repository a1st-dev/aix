import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import {
   formatPromptFile,
   hasPromptFrontmatterFields,
   parsePromptFiles,
   parsePromptFrontmatter,
} from '../shared/prompt-utils.js';

/**
 * Antigravity prompts strategy. Workflows in Antigravity (`.agents/workflows/*.md`)
 * are deprecated in favor of Agent Skills (`.agents/skills/{name}/SKILL.md`).
 * aix converts prompts to skills during install while retaining parsing support
 * for legacy workflow files during import.
 */
export class AntigravityPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return false;
   }

   getPromptsDir(): string {
      return 'workflows';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string | null {
      return '.gemini/config/workflows';
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

   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['description', 'argument-hint']);
   }

   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description', 'argument-hint']);
   }
}
