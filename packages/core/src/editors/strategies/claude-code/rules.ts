import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue } from '../../../frontmatter-utils.js';

/**
 * Claude Code rules strategy. Uses markdown files with optional YAML frontmatter. Only adds
 * frontmatter when there are paths (globs) or description to specify.
 */
export class ClaudeCodeRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'rules';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.claude/CLAUDE.md';
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const frontmatter: Record<string, unknown> = {};

      // Add description if present
      if (rule.activation.description) {
         frontmatter.description = rule.activation.description;
      }

      // Add paths for glob activation mode
      if (rule.activation.type === 'glob' && rule.activation.globs?.length) {
         frontmatter.paths = rule.activation.globs;
      }

      // Build output - only include frontmatter if we have fields
      const lines: string[] = [];

      if (Object.keys(frontmatter).length > 0) {
         lines.push('---');
         for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
               lines.push(`${key}:`);
               for (const item of value) {
                  lines.push(`  - ${item}`);
               }
            } else if (typeof value === 'string') {
               lines.push(`${key}: "${value}"`);
            } else {
               lines.push(`${key}: ${value}`);
            }
         }
         lines.push('---', '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }

   /**
    * Detect if content appears to be in Claude Code's frontmatter format.
    * Claude Code uses `paths:` field in frontmatter for rules.
    */
   detectFormat(content: string): boolean {
      const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

      if (!hasFrontmatter) {
         return false;
      }

      const lines = frontmatter.split('\n');

      return parseYamlValue(lines, 'paths') !== undefined;
   }

   /**
    * Parse Claude Code-specific frontmatter into unified format.
    * - `paths:` array → `globs[]`, `activation: 'glob'`
    * - No paths → `activation: 'always'`
    */
   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

      if (!hasFrontmatter) {
         return { content: rawContent, metadata: {} };
      }

      const lines = frontmatter.split('\n'),
            description = parseYamlValue(lines, 'description') as string | undefined,
            paths = parseYamlValue(lines, 'paths');

      // Parse paths (can be array or comma-separated string)
      let globsArray: string[] | undefined;

      if (Array.isArray(paths)) {
         globsArray = paths;
      } else if (typeof paths === 'string') {
         globsArray = paths.split(',').map((g) => g.trim());
      }

      // Determine activation mode
      let activation: ActivationMode | undefined;

      if (globsArray && globsArray.length > 0) {
         activation = 'glob';
      } else {
         activation = 'always';
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
