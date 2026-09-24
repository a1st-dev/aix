import { join } from 'pathe';
import type { ActivationMode } from '@a1st/aix-schema';
import type { ImportedRulesResult, NamedRule, ParsedRuleFrontmatter, RulesStrategy } from '../types.js';
import type { EditorRule } from '../../types.js';
import { extractFrontmatter, parseYamlValue, quoteYamlString } from '../../../frontmatter-utils.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { isFallbackClaudeMd } from './fallback.js';

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

   getGlobalRuleImportDirs(): readonly string[] {
      return ['.claude/rules'];
   }

   parseGlobalRules(content: string): { rules: string[]; warnings: string[] } {
      const rules: string[] = [];

      if (content.trim()) {
         rules.push(content.trim());
      }
      return { rules, warnings: [] };
   }

   async importProjectRules(projectRoot: string, editorConfigDir: string = '.claude'): Promise<ImportedRulesResult> {
      const warnings: string[] = [],
            rulesDir = join(projectRoot, editorConfigDir, this.getRulesDir()),
            ext = this.getFileExtension();

      try {
         const files = await getRuntimeAdapter().fs.readdir(rulesDir),
               ruleFiles = files.filter((f) => {
                  return f.endsWith(ext);
               }),
               loadedRules = await Promise.all(
                  ruleFiles.map(async (file) => {
                     try {
                        const filePath = join(rulesDir, file),
                              content = await getRuntimeAdapter().fs.readFile(filePath, 'utf-8'),
                              name = file.slice(0, -ext.length);

                        return { content, name, path: filePath, scope: 'project' as const };
                     } catch {
                        return null;
                     }
                  }),
               ),
               rules: NamedRule[] = [],
               paths: Record<string, string> = {},
               scopes: Record<string, 'project'> = {};

         for (const rule of loadedRules) {
            if (rule) {
               rules.push(rule);
               paths[rule.name] = rule.path;
               scopes[rule.name] = 'project';
            }
         }

         if (rules.length > 0) {
            return { rules, paths, scopes, warnings };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read local rules from ${rulesDir}: ${(err as Error).message}`);
         }
      }

      // If no granular rules found, check CLAUDE.md if it is not a fallback pointer to AGENTS.md
      const claudeMdPath = join(projectRoot, 'CLAUDE.md');

      try {
         const content = await getRuntimeAdapter().fs.readFile(claudeMdPath, 'utf-8');

         if (content.trim() && !isFallbackClaudeMd(content)) {
            return {
               rules: [ { content: content.trim(), name: 'CLAUDE', path: claudeMdPath, scope: 'project' } ],
               paths: { CLAUDE: claudeMdPath },
               scopes: { CLAUDE: 'project' },
               warnings,
            };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read rules from ${claudeMdPath}: ${(err as Error).message}`);
         }
      }

      // Finally check root AGENTS.md
      const agentsMdPath = join(projectRoot, 'AGENTS.md');

      try {
         const content = await getRuntimeAdapter().fs.readFile(agentsMdPath, 'utf-8');

         if (content.trim()) {
            return {
               rules: [ { content: content.trim(), name: 'AGENTS', path: agentsMdPath, scope: 'project' } ],
               paths: { AGENTS: agentsMdPath },
               scopes: { AGENTS: 'project' },
               warnings,
            };
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read rules from ${agentsMdPath}: ${(err as Error).message}`);
         }
      }

      return { rules: [], paths: {}, scopes: {}, warnings };
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
                  lines.push(`  - ${quoteYamlString(String(item))}`);
               }
            } else if (typeof value === 'string') {
               lines.push(`${key}: ${quoteYamlString(value)}`);
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
