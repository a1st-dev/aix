import type { AiJsonConfig } from '@a1st/aix-schema';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   CopilotRulesStrategy,
   CopilotMcpStrategy,
   CopilotPromptsStrategy,
   CopilotHooksStrategy,
} from '../strategies/copilot/index.js';
import { NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * GitHub Copilot editor adapter. Writes rules to `.github/instructions/*.instructions.md`,
 * MCP config to `.vscode/mcp.json`, skills to `.github/skills/`, and hooks to `.github/hooks/hooks.json`.
 * Skills are installed to `.aix/skills/{name}/` with symlinks from `.github/skills/` since GitHub Copilot
 * has native Agent Skills support.
 */
export class CopilotAdapter extends BaseEditorAdapter {
   readonly name = 'copilot' as const;
   readonly configDir = '.vscode';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Code'],
         linux: ['.config/Code'],
         win32: ['AppData/Roaming/Code'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new CopilotRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new CopilotMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.github/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new CopilotPromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new CopilotHooksStrategy();

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

   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      return changes;
   }
}
