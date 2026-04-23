import { join } from 'pathe';
import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

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
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      type ParseResult =
         | { type: 'prompt'; name: string; content: string }
         | { type: 'warning'; message: string }
         | null;

      const results = await Promise.all(
         mdFiles.map(async (file): Promise<ParseResult> => {
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
         }),
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

   /**
    * Detect if content appears to be in Codex's prompt frontmatter format.
    * Codex prompts use `description:` and optionally `argument-hint:` fields (similar to GitHub Copilot).
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      // Codex uses description/argument-hint but NOT mode/tools (GitHub Copilot) or allowed-tools (Claude)
      return parseYamlValue(lines, 'description') !== undefined
         && parseYamlValue(lines, 'mode') === undefined
         && parseYamlValue(lines, 'tools') === undefined
         && parseYamlValue(lines, 'allowed-tools') === undefined
         && parseYamlValue(lines, 'context') === undefined;
   }

   /**
    * Parse Codex-specific frontmatter into unified format.
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
