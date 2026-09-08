import type { ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter } from '../../../frontmatter-utils.js';

/**
 * Grok CLI rules strategy. Grok reads markdown rule files from `.grok/rules/*.md` (project)
 * and `~/.grok/rules/*.md` (user/global).
 */
export class GrokRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return 'rules';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return null;
   }

   getGlobalRuleImportDirs(): readonly string[] {
      return ['.grok/rules'];
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   formatRule(rule: EditorRule): string {
      const { content } = extractFrontmatter(rule.content),
            trimmed = content.trim(),
            contentStartsWithHeading = /^#\s/.test(trimmed);

      if (rule.name && !contentStartsWithHeading) {
         return `# ${rule.name}\n\n${trimmed}`;
      }

      return trimmed;
   }

   detectFormat(_content: string): boolean {
      return false;
   }

   parseFrontmatter(rawContent: string): ParsedRuleFrontmatter {
      const { content } = extractFrontmatter(rawContent);

      return { content, metadata: {} };
   }
}
