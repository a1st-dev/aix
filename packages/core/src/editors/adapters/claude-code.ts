import type { AiJsonConfig, HooksConfig } from '@a1st/aix-schema';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   ClaudeCodeRulesStrategy,
   ClaudeCodeMcpStrategy,
   ClaudeCodePromptsStrategy,
   ClaudeCodeHooksStrategy,
} from '../strategies/claude-code/index.js';
import { NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * Claude Code editor adapter. Writes rules to `.claude/rules/*.md` and MCP config to
 * `.claude/.mcp.json`. Skills are installed to `.aix/skills/{name}/` with symlinks from
 * `.claude/skills/` since Claude Code has native Agent Skills support. Hooks are written
 * to `.claude/settings.json`.
 */
export class ClaudeCodeAdapter extends BaseEditorAdapter {
   readonly name = 'claude-code' as const;
   readonly configDir = '.claude';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Claude'],
         linux: ['.config/Claude'],
         win32: ['AppData/Roaming/Claude'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new ClaudeCodeRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new ClaudeCodeMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.claude/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new ClaudeCodePromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new ClaudeCodeHooksStrategy();

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
            hooks = this.extractHooks(config);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp, hooks };
   }

   /**
    * Extract hooks from the top-level config.
    */
   private extractHooks(config: AiJsonConfig): HooksConfig | undefined {
      return config.hooks;
   }

   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      // Get base changes from parent (rules, MCP, prompts, hooks)
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      // Add skill changes only if skills scope is included
      if (scopes.includes('skills')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      return changes;
   }
}
