import type { AiJsonConfig } from '@a1st/aix-schema';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions } from '../types.js';
import { CodexRulesStrategy, CodexPromptsStrategy, CodexMcpStrategy } from '../strategies/codex/index.js';
import { NativeSkillsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * Codex CLI editor adapter. Writes rules to `AGENTS.md` at the project root (and optionally in
 * subdirectories for glob-scoped rules). Skills go to `.codex/skills/{name}/`. MCP config is
 * global-only (`~/.codex/config.toml`). Prompts are also global-only (`~/.codex/prompts/`). Codex
 * does not support hooks.
 *
 * Codex discovers AGENTS.md files by walking from the project root down to the CWD, reading at
 * most one per directory. Rules with a clear single-directory glob prefix (e.g. `src/utils/**`) are
 * placed in that subdirectory's AGENTS.md so they only apply when Codex runs from that context.
 * All other rules (always, auto, manual, or globs without a clear prefix) go to the root file.
 */
export class CodexAdapter extends BaseEditorAdapter {
   readonly name = 'codex' as const;
   readonly configDir = '.codex';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.codex'],
         linux: ['.codex'],
         win32: ['.codex'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new CodexRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new CodexMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.codex/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new CodexPromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new NoHooksStrategy();

   private pendingSkillChanges: FileChange[] = [];

   async generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<EditorConfig> {
      const { rules, skillChanges } = await this.loadRules(config, projectRoot, {
               dryRun: options.dryRun,
               scopes: options.scopes,
               configBaseDir: options.configBaseDir,
            }),
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp };
   }

   /**
    * Override planChanges to write AGENTS.md files at the project root and in subdirectories.
    * Glob-activation rules with a clear directory prefix are placed in subdirectory AGENTS.md files;
    * all other rules go to the root AGENTS.md. Also cleans up the legacy `.codex/AGENTS.md` file.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      _options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [];

      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         // Bucket rules by target directory
         const buckets = this.bucketRulesByDirectory(editorConfig.rules);

         for (const [dir, rules] of buckets) {
            const agentsPath = dir === '' ? join(projectRoot, 'AGENTS.md') : join(projectRoot, dir, 'AGENTS.md'),
                  content = this.formatAgentsMd(rules),
                  // eslint-disable-next-line no-await-in-loop -- sequential for deterministic ordering
                  existing = await this.readExisting(agentsPath),
                  action = this.determineAction(existing, content);

            // eslint-disable-next-line no-await-in-loop -- sequential for deterministic ordering
            changes.push({ path: agentsPath, action, content, category: 'rule' });
         }

         // Clean up legacy .codex/AGENTS.md if it exists
         const legacyPath = join(projectRoot, '.codex', 'AGENTS.md');

         if (existsSync(legacyPath)) {
            changes.push({ path: legacyPath, action: 'delete', content: '', category: 'rule' });
         }
      }

      // Add skill changes
      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      return changes;
   }

   /**
    * Group rules by target directory. Glob-activation rules with a clear single-directory prefix go
    * into that subdirectory; everything else goes to root (empty string key).
    */
   private bucketRulesByDirectory(rules: EditorRule[]): Map<string, EditorRule[]> {
      const buckets = new Map<string, EditorRule[]>();

      for (const rule of rules) {
         const dir = extractGlobDirectoryPrefix(rule);
         let bucket = buckets.get(dir);

         if (!bucket) {
            bucket = [];
            buckets.set(dir, bucket);
         }
         bucket.push(rule);
      }

      return buckets;
   }

   /**
    * Format rules into an AGENTS.md file body.
    */
   private formatAgentsMd(rules: EditorRule[]): string {
      const lines: string[] = ['# AGENTS.md', ''];

      for (const rule of rules) {
         lines.push(this.rulesStrategy.formatRule(rule), '');
      }

      return lines.join('\n');
   }
}

/**
 * Extract a common directory prefix from a glob-activation rule's globs. Returns the shared
 * leading directory when all globs point into the same subtree (e.g. `src/utils/`). Returns `''`
 * (root) for non-glob rules or when no unambiguous prefix exists.
 */
export function extractGlobDirectoryPrefix(rule: EditorRule): string {
   if (rule.activation.type !== 'glob' || !rule.activation.globs?.length) {
      return '';
   }

   const prefixes = rule.activation.globs.map(extractStaticPrefix);

   // All globs must share the same non-empty prefix
   const first = prefixes[0];

   if (!first) {
      return '';
   }

   for (let i = 1; i < prefixes.length; i++) {
      if (prefixes[i] !== first) {
         return '';
      }
   }

   return first;
}

/**
 * Extract the static directory prefix from a single glob pattern — the leading path segments that
 * contain no wildcard or brace characters. Returns `''` if the first segment is already a wildcard.
 */
function extractStaticPrefix(glob: string): string {
   const segments = glob.split('/'),
         staticSegments: string[] = [];

   for (const seg of segments) {
      if (/[*?{}[\]]/.test(seg)) {
         break;
      }
      staticSegments.push(seg);
   }

   return staticSegments.join('/');
}
