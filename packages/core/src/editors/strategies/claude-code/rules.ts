import type { RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';

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

      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`# ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
