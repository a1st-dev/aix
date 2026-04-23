import type { AiJsonConfig, ParsedSkill } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type {
   EditorConfig,
   EditorRule,
   FileChange,
   ApplyOptions,
   UnsupportedFeatures,
} from '../types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';
import {
   CodexRulesStrategy,
   CodexPromptsStrategy,
   CodexMcpStrategy,
} from '../strategies/codex/index.js';
import { NativeSkillsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
import { convertPromptsToSkills } from '../../prompts/to-skills.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { getRuntimeAdapter } from '../../runtime/index.js';

/**
 * Codex CLI editor adapter. Writes rules to `AGENTS.md` at the project root (and optionally in
 * subdirectories for glob-scoped rules) using section-managed markdown to preserve user content.
 * Project skills go to `.agents/skills/{name}/`, while user-scoped skills go to
 * `~/.codex/skills/{name}/`. MCP config is global-only (`~/.codex/config.toml`). Codex does not
 * support prompt deployment or hooks, so aix converts configured prompts into skills during
 * install.
 *
 * Codex discovers AGENTS.md files by walking from the project root down to the CWD, reading at
 * most one per directory. Rules with a clear single-directory glob prefix (e.g. `src/utils/**`) are
 * placed in that subdirectory's AGENTS.md so they only apply when Codex runs from that context.
 * All other rules (always, auto, manual, or globs without a clear prefix) go to the root file.
 *
 * Aix-managed rules are wrapped in sentinel markers (`<!-- BEGIN AIX MANAGED SECTION -->`) so that
 * user-maintained content in AGENTS.md is never overwritten.
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
      editorSkillsDir: '.agents/skills',
      userEditorSkillsDir: '.codex/skills',
   });

   protected readonly promptsStrategy: PromptsStrategy = new CodexPromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new NoHooksStrategy();

   private pendingSkillChanges: FileChange[] = [];

   async generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<EditorConfig> {
      const { rules, skillChanges, skills } = await this.loadRules(config, projectRoot, {
               dryRun: options.dryRun,
               scopes: options.scopes,
               configBaseDir: options.configBaseDir,
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(config, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            mcp = filterMcpConfig(config.mcp);

      const promptSkillChanges = await this.installPromptSkills(
         prompts,
         skills,
         projectRoot,
         options,
      );

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return { rules, prompts: [], mcp };
   }

   override getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures {
      const unsupported = super.getUnsupportedFeatures(config);

      delete unsupported.prompts;

      return unsupported;
   }

   /**
    * Override planChanges to write AGENTS.md files at the project root and in subdirectories
    * using section-managed markdown. Glob-activation rules with a clear directory prefix are
    * placed in subdirectory AGENTS.md files; all other rules go to the root AGENTS.md.
    * User content outside the managed section is preserved. Also cleans up the legacy
    * `.codex/AGENTS.md` file.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [];

      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         if (options.targetScope === 'user') {
            const agentsPath = join(
                     getRuntimeAdapter().os.homedir(),
                     this.rulesStrategy.getGlobalRulesPath() ?? '.codex/AGENTS.md',
                  ),
                  managedContent = this.formatManagedRules(editorConfig.rules),
                  existing = await this.readExisting(agentsPath),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: agentsPath, action, content, category: 'rule' });
         } else {
            // Bucket rules by target directory
            const buckets = this.bucketRulesByDirectory(editorConfig.rules);

            for (const [dir, rules] of buckets) {
               const agentsPath =
                        dir === ''
                           ? join(projectRoot, 'AGENTS.md')
                           : join(projectRoot, dir, 'AGENTS.md'),
                     managedContent = this.formatManagedRules(rules),
                     // eslint-disable-next-line no-await-in-loop -- sequential for deterministic ordering
                     existing = await this.readExisting(agentsPath),
                     content = upsertManagedSection(existing, managedContent),
                     action = this.determineAction(existing, content);

               // eslint-disable-next-line no-await-in-loop -- sequential for deterministic ordering
               changes.push({ path: agentsPath, action, content, category: 'rule' });
            }

            // Clean up legacy .codex/AGENTS.md if it exists
            const legacyPath = join(projectRoot, '.codex', 'AGENTS.md');

            if (getRuntimeAdapter().fs.existsSync(legacyPath)) {
               changes.push({ path: legacyPath, action: 'delete', content: '', category: 'rule' });
            }
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
    * Format rules into managed section content (without section markers — those are added by
    * upsertManagedSection). Does not include a file header since the file belongs to the user.
    */
   private formatManagedRules(rules: EditorRule[]): string {
      const parts: string[] = [];

      for (const rule of rules) {
         parts.push(this.rulesStrategy.formatRule(rule));
      }

      return parts.join('\n\n');
   }

   private async installPromptSkills(
      prompts: EditorConfig['prompts'],
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: ApplyOptions,
   ): Promise<FileChange[]> {
      const scopes = options.scopes ?? ['rules', 'mcp', 'skills', 'editors'];

      if (prompts.length === 0 || (!scopes.includes('editors') && !scopes.includes('prompts'))) {
         return [];
      }

      const existingSkillNames = new Set<string>();

      for (const [name, skill] of skills) {
         existingSkillNames.add(name);
         if (skill.frontmatter.name) {
            existingSkillNames.add(skill.frontmatter.name);
         }
      }

      const { skills: promptSkills } = await convertPromptsToSkills(prompts, {
         existingSkillNames,
      });

      return this.skillsStrategy.installSkills(promptSkills, projectRoot, options);
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
