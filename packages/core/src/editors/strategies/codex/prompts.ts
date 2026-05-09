import { join } from 'pathe';
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
 * Codex prompts strategy. Following APM's Codex target mapping, aix does not deploy
 * prompts for Codex; prompt-like reusable behavior should be packaged as skills.
 */
export class CodexPromptsStrategy implements PromptsStrategy {
   /**
    * Codex has deprecated user-level custom prompts, but no project-local prompt target.
    * Treat prompts as unsupported so project installs do not mutate `~/.codex/prompts`.
    */
   isSupported(): boolean {
      return false;
   }

   /**
    * Codex does not get prompt deployment through aix.
    */
   isGlobalOnly(): boolean {
      return false;
   }

   getPromptsDir(): string {
      return '';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string {
      return '';
   }

   /**
    * Get the absolute path to the global prompts directory.
    */
   getAbsoluteGlobalPath(): string {
      return join(getRuntimeAdapter().os.homedir(), this.getGlobalPromptsPath());
   }

   /**
    * Check if a prompt exists in the global prompts directory.
    */
   async promptExists(name: string): Promise<boolean> {
      const promptPath = join(this.getAbsoluteGlobalPath(), `${name}.md`);

      return getRuntimeAdapter().fs.existsSync(promptPath);
   }

   /**
    * Read an existing prompt from the global prompts directory.
    */
   async readPrompt(name: string): Promise<string | null> {
      const promptPath = join(this.getAbsoluteGlobalPath(), `${name}.md`);

      if (!getRuntimeAdapter().fs.existsSync(promptPath)) {
         return null;
      }

      try {
         return await getRuntimeAdapter().fs.readFile(promptPath, 'utf-8');
      } catch {
         return null;
      }
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
    * Detect if content appears to be in Codex's prompt frontmatter format.
    * Codex prompts use `description:` and optionally `argument-hint:` fields (similar to GitHub Copilot).
    */
   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['description'], [
         'mode',
         'tools',
         'allowed-tools',
         'context',
      ]);
   }

   /**
    * Parse Codex-specific frontmatter into unified format.
    * Extracts `description` and `argument-hint` fields.
    */
   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description', 'argument-hint']);
   }
}
