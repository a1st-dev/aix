import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

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
      lines.push(rule.content);
      return lines.join('\n');
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      return { rules: [], warnings: [] };
   }

   /**
    * Detect if content appears to be in Cursor's frontmatter format.
    * Cursor uses `alwaysApply:` field in frontmatter.
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      return parseYamlValue(lines, 'alwaysApply') !== undefined;
   }

   /**
    * Parse Cursor-specific frontmatter into unified format.
    * - `alwaysApply: true` → `activation: 'always'`
    * - `alwaysApply: false` + `globs:` → `activation: 'glob'`
    * - `alwaysApply: false` + `description:` (no globs) → `activation: 'auto'`
    * - `alwaysApply: false` (no globs, no description) → `activation: 'manual'`
    */
   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent, metadata: {} };
      }

      const lines = frontmatter.split('\n'),
            alwaysApply = parseYamlValue(lines, 'alwaysApply') as boolean | undefined,
            description = parseYamlValue(lines, 'description') as string | undefined,
            globs = parseYamlValue(lines, 'globs');

      // Parse globs (can be comma-separated string or array)
      const globsArray = typeof globs === 'string' ? globs.split(',').map((g) => g.trim()) : (globs as string[] | undefined);

      // Determine activation mode based on Cursor's rules
      let activation: ActivationMode | undefined;

      if (alwaysApply === true) {
         activation = 'always';
      } else if (globsArray && globsArray.length > 0) {
         activation = 'glob';
      } else if (description) {
         activation = 'auto';
      } else if (alwaysApply === false) {
         activation = 'manual';
      }

      return {
         content,
         metadata: {
            activation,
            description,
            globs: globsArray,
         },
      };
   }
}
