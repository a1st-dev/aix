import { join } from 'pathe';
import type { ImportedRulesResult, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { formatPlainMarkdownRule } from '../shared/rule-utils.js';

/**
 * Codex CLI rules strategy. Uses `AGENTS.md` files at the project root (and optionally in
 * subdirectories for glob-scoped rules). Plain markdown, no frontmatter. The adapter handles
 * bucketing rules into per-directory files.
 */
export class CodexRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Codex uses AGENTS.md at the project root, one level above the .codex config dir
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.codex/AGENTS.md';
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   async importProjectRules(projectRoot: string): Promise<ImportedRulesResult> {
      const warnings: string[] = [],
            agentsPath = join(projectRoot, 'AGENTS.md');

      try {
         const content = await getRuntimeAdapter().fs.readFile(agentsPath, 'utf-8');

         if (content.trim()) {
            return {
               rules: [{ content: content.trim(), name: 'AGENTS', path: agentsPath, scope: 'project' }],
               paths: { AGENTS: agentsPath },
               scopes: { AGENTS: 'project' },
               warnings,
            };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read Codex rules from ${agentsPath}: ${(err as Error).message}`);
         }
      }

      return { rules: [], paths: {}, scopes: {}, warnings };
   }

   formatRule(rule: EditorRule): string {
      return formatPlainMarkdownRule(rule, '##');
   }
}
