import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

/**
 * Kiro rules strategy - formats rules as steering files with YAML frontmatter.
 * Uses `inclusion` field for activation modes:
 * - `inclusion: always` - Always included (default)
 * - `inclusion: manual` - Only when referenced with # in chat
 * - `inclusion: fileMatch` - Conditionally included based on file patterns
 */
export class KiroRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'steering';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.kiro/steering';
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = ['---'];

      // Map activation type to Kiro inclusion values
      switch (rule.activation.type) {
      case 'always':
         lines.push('inclusion: always');
         break;
      case 'auto':
         lines.push('inclusion: always');
         if (rule.activation.description) {
            lines.push(`description: "${rule.activation.description}"`);
         }
         break;
      case 'glob':
         lines.push('inclusion: fileMatch');
         if (rule.activation.globs?.length) {
            lines.push(`fileMatchPattern: "${rule.activation.globs.join(',')}"`);
         }
         break;
      case 'manual':
         lines.push('inclusion: manual');
         break;
      }

      lines.push('---', '');
      lines.push(rule.content);
      return lines.join('\n');
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      // Kiro uses directory of files, not a single file
      return { rules: [], warnings: ['Kiro uses directory-based rules'] };
   }

   /**
    * Detect if content appears to be in Kiro's frontmatter format.
    * Kiro uses `inclusion:` field in frontmatter.
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      return parseYamlValue(lines, 'inclusion') !== undefined;
   }

   /**
    * Parse Kiro-specific frontmatter into unified format.
    * - `inclusion: always` → `activation: 'always'`
    * - `inclusion: manual` → `activation: 'manual'`
    * - `inclusion: fileMatch` → `activation: 'glob'`
    */
   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent, metadata: {} };
      }

      const lines = frontmatter.split('\n'),
            inclusion = parseYamlValue(lines, 'inclusion') as string | undefined,
            description = parseYamlValue(lines, 'description') as string | undefined,
            fileMatchPattern = parseYamlValue(lines, 'fileMatchPattern') as string | undefined;

      // Map Kiro inclusion values to unified activation modes
      const inclusionToActivation: Record<string, ActivationMode> = {
         always: 'always',
         manual: 'manual',
         fileMatch: 'glob',
      };

      const activation = inclusion ? inclusionToActivation[inclusion] : undefined,
            globs = fileMatchPattern ? fileMatchPattern.split(',').map((g) => g.trim()) : undefined;

      return {
         content,
         metadata: {
            activation,
            description,
            globs,
         },
      };
   }
}
