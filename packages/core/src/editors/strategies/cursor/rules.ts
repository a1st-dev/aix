import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

/**
 * Cursor rules strategy. Uses `.mdc` files (Markdown with YAML frontmatter) containing
 * `alwaysApply`, `globs`, and `description` fields.
 */
export class CursorRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'rules';
   }

   getFileExtension(): string {
      return '.mdc';
   }

   getGlobalRulesPath(): string | null {
      // Cursor stores user rules in Settings UI, not accessible via file
      return null;
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = ['---'];

      // Add description if present
      if (rule.activation.description) {
         lines.push(`description: "${rule.activation.description}"`);
      }

      // Add globs for glob activation mode
      if (rule.activation.type === 'glob' && rule.activation.globs?.length) {
         lines.push(`globs: ${rule.activation.globs.join(', ')}`);
      }

      // alwaysApply is true for 'always' activation, false otherwise
      lines.push(`alwaysApply: ${rule.activation.type === 'always'}`);

      lines.push('---', '');

      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`# ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      return { rules: [], warnings: [] };
   }
}
