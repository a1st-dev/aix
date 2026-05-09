import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import { parsePromptFiles } from '../shared/prompt-utils.js';

/**
 * Gemini CLI prompts strategy. Gemini uses TOML files in `.gemini/commands/` for custom
 * slash commands. Each command has a `description` and `prompt` field.
 *
 * Format:
 * ```toml
 * description = "Review code changes"
 * prompt = "Review the following code..."
 * ```
 */
export class GeminiPromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      return 'commands';
   }

   getFileExtension(): string {
      return '.toml';
   }

   getGlobalPromptsPath(): string | null {
      return '.gemini/commands';
   }

   formatPrompt(prompt: EditorPrompt): string {
      const lines: string[] = [];

      if (prompt.description) {
         lines.push(`description = ${tomlQuote(prompt.description)}`);
      }

      lines.push(`prompt = ${tomlQuote(prompt.content)}`);

      return lines.join('\n') + '\n';
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      return parsePromptFiles({
         files,
         readFile,
         includeFile: (file) => file.endsWith('.toml'),
         stripSuffix: /\.toml$/,
      });
   }

   /**
    * Detect if content appears to be in Gemini's TOML prompt format.
    * Gemini prompts use `prompt = "..."` in TOML.
    */
   detectFormat(content: string): boolean {
      return /^prompt\s*=/m.test(content);
   }

   /**
    * Parse Gemini TOML prompt format into unified format.
    * Extracts `description` and `prompt` fields.
    */
   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      // For TOML prompts, the entire file is the "prompt" definition
      const descMatch = rawContent.match(/^description\s*=\s*"([^"]*(?:\\.[^"]*)*)"/m),
            promptMatch = rawContent.match(/^prompt\s*=\s*"([^"]*(?:\\.[^"]*)*)"/m);

      // Try multiline literal strings (triple quotes)
      const promptMultiMatch = rawContent.match(/^prompt\s*=\s*"""([\s\S]*?)"""/m);

      const description = descMatch?.[1] ? unescapeToml(descMatch[1]) : undefined;
      const content = promptMultiMatch?.[1]
         ? promptMultiMatch[1].trim()
         : promptMatch?.[1]
            ? unescapeToml(promptMatch[1])
            : rawContent;

      return {
         content,
         description,
      };
   }
}

/**
 * Quote a string for TOML format. Uses multiline literal strings (triple quotes) for content
 * with newlines, otherwise uses basic strings with escaping.
 */
function tomlQuote(value: string): string {
   if (value.includes('\n')) {
      // Use multiline basic string
      return `"""\n${value}\n"""`;
   }
   // Escape backslashes and quotes for basic string
   const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

   return `"${escaped}"`;
}

/**
 * Unescape a TOML basic string value.
 */
function unescapeToml(value: string): string {
   return value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
}
