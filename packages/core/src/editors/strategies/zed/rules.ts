import { join } from 'pathe';
import type { ImportedRulesResult, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { formatPlainMarkdownRule } from '../shared/rule-utils.js';

/**
 * Zed rules strategy. Uses a single `.rules` file at project root (plain markdown, no frontmatter).
 * Zed reads `.rules` files at the top level of worktrees.
 */
export class ZedRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Zed uses .rules at project root, not in .zed/
      return '..';
   }

   getFileExtension(): string {
      // Zed uses .rules extension (no .md)
      return '';
   }

   getGlobalRulesPath(): string | null {
      // Zed doesn't have global rules file
      return null;
   }

   parseGlobalRules(_content: string): { rules: string[]; warnings: string[] } {
      return { rules: [], warnings: [] };
   }

   async importProjectRules(projectRoot: string): Promise<ImportedRulesResult> {
      const warnings: string[] = [],
            rulesPath = join(projectRoot, '.rules');

      try {
         const content = await getRuntimeAdapter().fs.readFile(rulesPath, 'utf-8');

         if (content.trim()) {
            return {
               rules: [{
                  content: content.trim(),
                  name: 'project rules',
                  path: rulesPath,
                  scope: 'project',
               }],
               paths: { 'project rules': rulesPath },
               scopes: { 'project rules': 'project' },
               warnings,
            };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read Zed rules from ${rulesPath}: ${(err as Error).message}`);
         }
      }

      return { rules: [], paths: {}, scopes: {}, warnings };
   }

   formatRule(rule: EditorRule): string {
      return formatPlainMarkdownRule(rule, '#');
   }
}
