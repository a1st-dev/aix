import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
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
 * Codex CLI editor adapter. Writes rules to `.codex/AGENTS.md` (single file, plain markdown) and
 * skills to `.codex/skills/{name}/`. MCP config is global-only (`~/.codex/config.toml`) and
 * requires user confirmation to modify. Codex prompts are also global-only (`~/.codex/prompts/`).
 * Codex does not support hooks.
 */
export class CodexAdapter extends BaseEditorAdapter {
   readonly name = 'codex' as const;
   readonly configDir = '.codex';

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
    * Override planChanges to write all rules to a single AGENTS.md file instead of separate files.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      _options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [],
            configDir = join(projectRoot, this.configDir);

      // Rules - Codex uses a single AGENTS.md file
      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         const agentsPath = join(configDir, 'AGENTS.md'),
               content = this.formatAgentsMd(editorConfig.rules),
               existing = await this.readExisting(agentsPath),
               action = this.determineAction(existing, content);

         changes.push({ path: agentsPath, action, content, category: 'rule' });
      }

      // Add skill changes
      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      return changes;
   }

   /**
    * Format all rules into a single AGENTS.md file.
    */
   private formatAgentsMd(rules: EditorConfig['rules']): string {
      const lines: string[] = ['# AGENTS.md', ''];

      for (const rule of rules) {
         lines.push(this.rulesStrategy.formatRule(rule), '');
      }

      return lines.join('\n');
   }
}
