import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

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

   /**
    * Detect if content appears to be in Windsurf's frontmatter format.
    * Windsurf uses `trigger:` field in frontmatter.
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      return parseYamlValue(lines, 'trigger') !== undefined;
   }

   /**
    * Parse Windsurf-specific frontmatter into unified format.
    * - `trigger: always_on` → `activation: 'always'`
    * - `trigger: model_decision` → `activation: 'auto'`
    * - `trigger: glob` → `activation: 'glob'`
    * - `trigger: manual` → `activation: 'manual'`
    */
   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent, metadata: {} };
      }

      const lines = frontmatter.split('\n'),
            trigger = parseYamlValue(lines, 'trigger') as string | undefined,
            description = parseYamlValue(lines, 'description') as string | undefined,
            globs = parseYamlValue(lines, 'globs');

      // Map Windsurf trigger values to unified activation modes
      const triggerToActivation: Record<string, ActivationMode> = {
         always_on: 'always',
         model_decision: 'auto',
         glob: 'glob',
         manual: 'manual',
      };

      const activation = trigger ? triggerToActivation[trigger] : undefined,
            globsArray = typeof globs === 'string' ? globs.split(',').map((g) => g.trim()) : (globs as string[] | undefined);

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
