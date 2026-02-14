import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * Codex CLI rules strategy. Uses `AGENTS.md` files at the project root (and optionally in
 * subdirectories for glob-scoped rules). Plain markdown, no frontmatter. The adapter handles
 * bucketing rules into per-directory files.
 */
export class CodexRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Codex uses AGENTS.md at the project root, one level above the .codex config dir
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.codex/AGENTS.md';
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

      // Codex uses plain markdown without frontmatter
      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`## ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
