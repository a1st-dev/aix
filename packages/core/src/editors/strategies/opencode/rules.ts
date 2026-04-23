import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * OpenCode reads `AGENTS.md` files for project and global rules. The adapter handles managed
 * section placement so user-owned AGENTS.md content is preserved.
 */
export class OpenCodeRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.config/opencode/AGENTS.md';
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [],
            contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`## ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
