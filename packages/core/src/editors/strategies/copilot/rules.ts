import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue, quoteYamlString } from '../../../frontmatter-utils.js';
import { getGlobalCopilotDir } from './paths.js';

/**
 * GitHub Copilot rules strategy. Uses `.instructions.md` files with YAML frontmatter
 * containing an `applyTo` field for glob patterns. Rules go to `.github/instructions/` directory.
 */
export class CopilotRulesStrategy implements RulesStrategy {

   constructor(private readonly globalDir: string = getGlobalCopilotDir()) {}

   getRulesDir(): string {
      // Rules go to .github/instructions/, not .vscode/
      return '../.github/instructions';
   }

   getFileExtension(): string {
      return '.instructions.md';
   }

   getGlobalRulesPath(): string {
      return `${this.globalDir}/copilot-instructions.md`;
   }

   getGlobalRulesDir(): string {
      return `${this.globalDir}/instructions`;
   }

   getGlobalRuleImportDirs(): readonly string[] {
      return [ this.getGlobalRulesDir() ];
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rule = content.trim();

      return { rules: rule ? [ rule ] : [], warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [];

      // GitHub Copilot uses applyTo for glob patterns, otherwise rules apply to all files
      if (rule.activation.type === 'glob' && rule.activation.globs?.length) {
         lines.push('---');
         // GitHub Copilot expects a single glob pattern string
         lines.push(`applyTo: ${quoteYamlString(rule.activation.globs.join(', '))}`);
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

   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { content, frontmatter } = extractFrontmatter(rawContent),
            applyTo = parseYamlValue(frontmatter.split('\n'), 'applyTo');

      if (typeof applyTo !== 'string' || !applyTo.trim()) {
         return { content, metadata: {} };
      }
      const globs = applyTo.split(',').map((glob) => {
         return glob.trim();
      }).filter(Boolean);

      return { content, metadata: { activation: 'glob', globs } };
   }
}
