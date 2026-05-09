import { join } from 'pathe';
import type { ImportedRulesResult, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

/**
 * Gemini CLI rules strategy. Uses `GEMINI.md` at the project root for project-level context and
 * instructions. Plain markdown, no frontmatter. The adapter handles section-managed writing to
 * avoid overwriting user content.
 */
export class GeminiRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      // Gemini uses GEMINI.md at the project root, one level above the .gemini config dir
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.gemini/GEMINI.md';
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
            geminiPath = join(projectRoot, 'GEMINI.md');

      try {
         const content = await getRuntimeAdapter().fs.readFile(geminiPath, 'utf-8');

         if (content.trim()) {
            return {
               rules: [{ content: content.trim(), name: 'GEMINI', path: geminiPath, scope: 'project' }],
               paths: { GEMINI: geminiPath },
               scopes: { GEMINI: 'project' },
               warnings,
            };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read Gemini rules from ${geminiPath}: ${(err as Error).message}`);
         }
      }

      return { rules: [], paths: {}, scopes: {}, warnings };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [];

      // Gemini uses plain markdown without frontmatter
      // Include rule name as heading for context, but only if content doesn't already start with one
      const contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`## ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}
