import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * Zed rules strategy. Uses a single `.rules` file at project root (plain markdown, no frontmatter).
 * Zed reads `.rules` files at the top level of worktrees.
 */
export class ZedRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Zed uses .rules at project root, not in .zed/
      return '..';
   }

   getFileExtension(): string {
      // Zed uses .rules extension (no .md)
      return '';
   }

   getGlobalRulesPath(): string | null {
      // Zed doesn't have global rules file
      return null;
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      return { rules: [], warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [];

      // Zed uses plain markdown without frontmatter
      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`# ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
