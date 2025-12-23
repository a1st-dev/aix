import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * Windsurf rules strategy. Uses markdown files with YAML frontmatter containing a `trigger` field
 * for activation mode.
 */
export class WindsurfRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'rules';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.codeium/windsurf/memories/global_rules.md';
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = ['---'];

      // Map activation type to Windsurf trigger values
      switch (rule.activation.type) {
      case 'always':
         lines.push('trigger: always_on');
         break;
      case 'auto':
         lines.push('trigger: model_decision');
         if (rule.activation.description) {
            lines.push(`description: ${rule.activation.description}`);
         }
         break;
      case 'glob':
         lines.push('trigger: glob');
         if (rule.activation.globs?.length) {
            lines.push(`globs: ${rule.activation.globs.join(', ')}`);
         }
         break;
      case 'manual':
         lines.push('trigger: manual');
         break;
      }

      lines.push('---', '');

      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`# ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }
}
