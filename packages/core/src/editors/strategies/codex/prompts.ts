import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';
import type { EditorPrompt } from '../../types.js';
import type { PromptsStrategy } from '../types.js';

/**
 * Codex prompts strategy. Codex prompts are global-only (`~/.codex/prompts/`).
 * The install flow handles global config management with user confirmation.
 */
export class CodexPromptsStrategy implements PromptsStrategy {
   /**
    * Returns true because prompts ARE supported, just globally.
    */
   isSupported(): boolean {
      return true;
   }

   /**
    * Returns true to indicate this editor only supports global prompts.
    */
   isGlobalOnly(): boolean {
      return true;
   }

   getPromptsDir(): string {
      return '';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string {
      return '.codex/prompts';
   }

   /**
    * Get the absolute path to the global prompts directory.
    */
   getAbsoluteGlobalPath(): string {
      return join(homedir(), this.getGlobalPromptsPath());
   }

   /**
    * Check if a prompt exists in the global prompts directory.
    */
   async promptExists(name: string): Promise<boolean> {
      const promptPath = join(this.getAbsoluteGlobalPath(), `${name}.md`);

      return existsSync(promptPath);
   }

   /**
    * Read an existing prompt from the global prompts directory.
    */
   async readPrompt(name: string): Promise<string | null> {
      const promptPath = join(this.getAbsoluteGlobalPath(), `${name}.md`);

      if (!existsSync(promptPath)) {
         return null;
      }

      try {
         return await readFile(promptPath, 'utf-8');
      } catch {
         return null;
      }
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
}
