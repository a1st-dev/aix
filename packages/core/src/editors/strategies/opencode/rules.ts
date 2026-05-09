import { join } from 'pathe';
import type { ImportedRulesResult, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { getOpenCodeConfigImportPaths, importOpenCodeInstructionRules } from './import-utils.js';

/**
 * OpenCode reads `AGENTS.md` files for project and global rules. The adapter handles managed
 * section placement so user-owned AGENTS.md content is preserved.
 */
export class OpenCodeRulesStrategy implements RulesStrategy {
   getRulesDir(): string {
      return '..';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalRulesPath(): string | null {
      return '.config/opencode/AGENTS.md';
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   async importGlobalRules(): Promise<ImportedRulesResult> {
      const warnings: string[] = [],
            rules: ImportedRulesResult['rules'] = [],
            paths: Record<string, string> = {},
            scopes: ImportedRulesResult['scopes'] = {},
            agentsPath = join(getRuntimeAdapter().os.homedir(), this.getGlobalRulesPath() ?? '.config/opencode/AGENTS.md');

      await readAgentsFile({
         path: agentsPath,
         name: 'AGENTS',
         scope: 'user',
         rules,
         paths,
         scopes,
         warnings,
      });

      for (const configPath of getOpenCodeConfigImportPaths(
         join(getRuntimeAdapter().os.homedir(), '.config', 'opencode', 'opencode.json'),
      )) {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const imported = await importOpenCodeInstructionRules(
            configPath,
            join(getRuntimeAdapter().os.homedir(), '.config', 'opencode'),
            'user',
         );

         if (imported.rules.length > 0 || imported.warnings.length > 0) {
            rules.push(...imported.rules);
            Object.assign(paths, imported.paths);
            Object.assign(scopes, imported.scopes);
            warnings.push(...imported.warnings);
            break;
         }
      }

      return { rules, paths, scopes, warnings };
   }

   async importProjectRules(projectRoot: string): Promise<ImportedRulesResult> {
      const warnings: string[] = [],
            rules: ImportedRulesResult['rules'] = [],
            paths: Record<string, string> = {},
            scopes: ImportedRulesResult['scopes'] = {},
            agentsPath = join(projectRoot, 'AGENTS.md');

      await readAgentsFile({
         path: agentsPath,
         name: 'AGENTS',
         scope: 'project',
         rules,
         paths,
         scopes,
         warnings,
      });

      for (const configPath of getOpenCodeConfigImportPaths(join(projectRoot, 'opencode.json'))) {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const imported = await importOpenCodeInstructionRules(configPath, projectRoot, 'project');

         if (imported.rules.length > 0 || imported.warnings.length > 0) {
            rules.push(...imported.rules);
            Object.assign(paths, imported.paths);
            Object.assign(scopes, imported.scopes);
            warnings.push(...imported.warnings);
            break;
         }
      }

      return { rules, paths, scopes, warnings };
   }

   formatRule(rule: EditorRule): string {
      const lines: string[] = [],
            contentStartsWithHeading = /^#\s/.test(rule.content.trim());

      if (rule.name && !contentStartsWithHeading) {
         lines.push(`## ${rule.name}`, '');
      }

      lines.push(rule.content);
      return lines.join('\n');
   }
}

interface ReadAgentsFileParams {
   path: string;
   name: string;
   scope: 'project' | 'user';
   rules: ImportedRulesResult['rules'];
   paths: Record<string, string>;
   scopes: ImportedRulesResult['scopes'];
   warnings: string[];
}

async function readAgentsFile(params: ReadAgentsFileParams): Promise<void> {
   const { path, name, scope, rules, paths, scopes, warnings } = params;

   try {
      const content = await getRuntimeAdapter().fs.readFile(path, 'utf-8');

      if (!content.trim()) {
         return;
      }

      rules.push({ content: content.trim(), name, path, scope });
      paths[name] = path;
      scopes[name] = scope;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read OpenCode rules from ${path}: ${(err as Error).message}`);
      }
   }
}
