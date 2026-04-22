import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * Gemini CLI rules strategy. Uses `GEMINI.md` at the project root for project-level context and
 * instructions. Plain markdown, no frontmatter. The adapter handles section-managed writing to
 * avoid overwriting user content.
 */
export class GeminiRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Gemini uses GEMINI.md at the project root, one level above the .gemini config dir
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.gemini/GEMINI.md';
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [];

      // Gemini uses plain markdown without frontmatter
      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`## ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
