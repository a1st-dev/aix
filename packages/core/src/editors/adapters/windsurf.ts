import type { AiJsonConfig } from '@a1st/aix-schema';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   WindsurfRulesStrategy,
   WindsurfPromptsStrategy,
   WindsurfHooksStrategy,
   WindsurfMcpStrategy,
   WindsurfSkillsStrategy,
} from '../strategies/windsurf/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * Windsurf editor adapter. Writes rules to `.windsurf/rules/*.md`. Skills are installed
 * natively to `.windsurf/skills/{name}/` via symlinks from `.aix/skills/{name}/`.
 * Hooks are written to `.windsurf/hooks.json`. MCP is global-only
 * (`~/.codeium/windsurf/mcp_config.json`) and requires user confirmation to modify.
 */
export class WindsurfAdapter extends BaseEditorAdapter {
   readonly name = 'windsurf' as const;
   readonly configDir = '.windsurf';

   protected readonly rulesStrategy: RulesStrategy = new WindsurfRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new WindsurfMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new WindsurfSkillsStrategy();
   protected readonly promptsStrategy: PromptsStrategy = new WindsurfPromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new WindsurfHooksStrategy();

   // Store skill changes from generateConfig for use in planChanges
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
      // Get base changes from parent (rules and MCP)
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      // Add skill changes only if skills scope is included
      if (scopes.includes('skills')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      return changes;
   }
}
