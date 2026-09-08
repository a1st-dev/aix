import { join } from 'pathe';
import type { PromptsStrategy } from '../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { parsePromptFiles } from '../shared/prompt-utils.js';

/**
 * Grok prompts strategy. aix installs prompts as skills for Grok CLI because custom
 * commands in the Grok TUI are backed by skills.
 */
export class GrokPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return false;
   }

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

   getAbsoluteGlobalPath(): string {
      return join(getRuntimeAdapter().os.homedir(), this.getGlobalPromptsPath());
   }

   async promptExists(name: string): Promise<boolean> {
      const promptPath = join(this.getAbsoluteGlobalPath(), `${name}.md`);

      return getRuntimeAdapter().fs.existsSync(promptPath);
   }

   formatPrompt(): string {
      return '';
   }

   parsePromptFile(): { content: string; description?: string } {
      return { content: '' };
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
}
