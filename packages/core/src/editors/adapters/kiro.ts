import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import {
   KiroRulesStrategy,
   KiroMcpStrategy,
   KiroSkillsStrategy,
   KiroPromptsStrategy,
   KiroHooksStrategy,
} from '../strategies/kiro/index.js';

/**
 * Kiro editor adapter. Writes rules and prompts to `.kiro/steering/*.md` (with YAML frontmatter),
 * MCP config to `.kiro/settings/mcp.json`, and hooks to `.kiro/hooks/*.json`.
 * Skills are stored in `.aix/skills/` (Agent Skills format) and converted to Powers in
 * `.kiro/powers/` during installation.
 */
export class KiroAdapter extends BaseEditorAdapter {
   readonly name = 'kiro' as const;
   readonly configDir = '.kiro';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.kiro'],
         linux: ['.kiro'],
         win32: ['.kiro'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new KiroRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new KiroMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new KiroSkillsStrategy();
   protected readonly promptsStrategy: PromptsStrategy = new KiroPromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new KiroHooksStrategy();

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
            prompts = await this.loadPrompts(config, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            mcp = filterMcpConfig(config.mcp),
            hooks = config.hooks;

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp, hooks };
   }

   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      // Add skill changes only if skills scope is included
      if (scopes.includes('skills')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      // Split hooks into individual JSON files
      if (scopes.includes('editors') && editorConfig.hooks) {
         const hookChanges = this.splitHooksIntoFiles(changes, projectRoot);
         // Remove the original hooks file change and add individual hook files
         const nonHookChanges = changes.filter((c) => c.category !== 'hook');

         return [...nonHookChanges, ...hookChanges];
      }

      return changes;
   }

   /**
    * Split hooks from a single JSON file into individual JSON files.
    * Extracts hooks from the formatted config and creates separate FileChange for each.
    */
   private splitHooksIntoFiles(changes: FileChange[], projectRoot: string): FileChange[] {
      const hookChanges: FileChange[] = [];
      const hooksDir = join(projectRoot, this.configDir, this.hooksStrategy.getConfigPath());

      // Find the hook change in the changes array
      const hookChange = changes.find((c) => c.category === 'hook');

      if (!hookChange || !hookChange.content) {
         return [];
      }

      try {
         // Parse the hooks JSON
         const parsed = JSON.parse(hookChange.content) as { hooks?: Record<string, unknown> };
         const hooks = parsed.hooks;

         if (!hooks || Object.keys(hooks).length === 0) {
            return [];
         }

         // Create individual file changes for each hook
         for (const [hookName, hookConfig] of Object.entries(hooks)) {
            const fileName = `${this.sanitizeFileName(hookName)}.json`;
            const filePath = join(hooksDir, fileName);
            const content = JSON.stringify(hookConfig, null, 2) + '\n';

            hookChanges.push({
               path: filePath,
               action: 'create',
               content,
               category: 'hook',
            });
         }
      } catch (_error) {
         // If parsing fails, return empty array (no hooks to split)
         return [];
      }

      return hookChanges;
   }
}
