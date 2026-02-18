import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * GitHub Copilot rules strategy. Uses `.instructions.md` files with YAML frontmatter
 * containing an `applyTo` field for glob patterns. Rules go to `.github/instructions/` directory.
 */
export class CopilotRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Rules go to .github/instructions/, not .vscode/
      return '../.github/instructions';
   }

   getFileExtension(): string {
      return '.instructions.md';
   }

   getGlobalRulesPath(): string | null {
      // GitHub Copilot doesn't have global rules file
      return null;
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      return { rules: [], warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [];

      // GitHub Copilot uses applyTo for glob patterns, otherwise rules apply to all files
      if (rule.activation.type === 'glob' && rule.activation.globs?.length) {
         lines.push('---');
         // GitHub Copilot expects a single glob pattern string
         lines.push(`applyTo: "${rule.activation.globs.join(', ')}"`);
         lines.push('---', '');
      }

      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`# ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
