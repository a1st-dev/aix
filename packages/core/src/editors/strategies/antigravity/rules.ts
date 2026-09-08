import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue, quoteYamlString } from '../../../frontmatter-utils.js';

/**
 * Antigravity rules strategy. Uses `.md` files in `.agents/rules/` with YAML frontmatter
 * containing `trigger` (always, glob, model, manual), `globs`, and `description`.
 */
export class AntigravityRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'rules';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.gemini/GEMINI.md';
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = ['---'];

      let trigger = 'always';

      if (rule.activation.type === 'glob') {
         trigger = 'glob';
      } else if (rule.activation.type === 'manual') {
         trigger = 'manual';
      } else if (rule.activation.type === 'auto') {
         trigger = 'model';
      }
      lines.push(`trigger: ${trigger}`);

      if (rule.activation.type === 'glob' && rule.activation.globs?.length) {
         lines.push(`globs: ${quoteYamlString(rule.activation.globs.join(', '))}`);
      }

      if (rule.activation.description) {
         lines.push(`description: ${quoteYamlString(rule.activation.description)}`);
      }

      lines.push('---', '');

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

   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      return parseYamlValue(lines, 'trigger') !== undefined;
   }

   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent, metadata: {} };
      }

      const lines = frontmatter.split('\n'),
            trigger = parseYamlValue(lines, 'trigger') as string | undefined,
            description = parseYamlValue(lines, 'description') as string | undefined,
            globs = parseYamlValue(lines, 'globs');

      const globsArray = typeof globs === 'string'
         ? globs.split(',').map((g) => g.trim())
         : (globs as string[] | undefined);

      let activation: ActivationMode | undefined;

      if (trigger === 'always') {
         activation = 'always';
      } else if (trigger === 'glob' || (globsArray && globsArray.length > 0)) {
         activation = 'glob';
      } else if (trigger === 'model' || trigger === 'auto') {
         activation = 'auto';
      } else if (trigger === 'manual') {
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
