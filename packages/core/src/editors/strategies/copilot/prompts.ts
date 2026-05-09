import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import {
   formatPromptFile,
   hasPromptFrontmatterFields,
   parsePromptFiles,
   parsePromptFrontmatter,
} from '../shared/prompt-utils.js';

/**
 * GitHub Copilot prompts strategy. Uses markdown files with YAML frontmatter in `.github/prompts/`.
 * Files use `.prompt.md` extension. Supports `name`, `description`, and `argument-hint`
 * frontmatter fields.
 */
export class CopilotPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      // GitHub Copilot prompt files go in .github/prompts/, not in .vscode/
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

      return paths[getRuntimeAdapter().os.platform()] ?? null;
   }

   formatPrompt(prompt: EditorPrompt): string {
      return formatPromptFile(prompt, {
         frontmatterFields: [
            { key: 'name', value: prompt.name },
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
         includeFile: (file) => file.endsWith('.md') && !file.endsWith('.instructions.md'),
         stripSuffix: /\.md$/,
         concurrency: 5,
      });
   }

   /**
    * Detect if content appears to be in GitHub Copilot's prompt frontmatter format.
    * GitHub Copilot prompts use `mode:` or `tools:` fields.
    */
   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['mode', 'tools']);
   }

   /**
    * Parse GitHub Copilot-specific frontmatter into unified format.
    * Extracts `description` and `argument-hint` fields.
    */
   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description', 'argument-hint']);
   }
}
