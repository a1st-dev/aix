import type { AiJsonConfig } from '@a1st/aix-schema';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   VSCodeRulesStrategy,
   VSCodeMcpStrategy,
   VSCodePromptsStrategy,
   VSCodeHooksStrategy,
} from '../strategies/vscode/index.js';
import { NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * VS Code (GitHub Copilot) editor adapter. Writes rules to `.github/instructions/*.instructions.md`,
 * MCP config to `.vscode/mcp.json`, skills to `.github/skills/`, and hooks to `.github/hooks/hooks.json`.
 * Skills are installed to `.aix/skills/{name}/` with symlinks from `.github/skills/` since VS Code
 * has native Agent Skills support.
 */
export class VSCodeAdapter extends BaseEditorAdapter {
   readonly name = 'vscode' as const;
   readonly configDir = '.vscode';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Code'],
         linux: ['.config/Code'],
         win32: ['AppData/Roaming/Code'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new VSCodeRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new VSCodeMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.github/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new VSCodePromptsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new VSCodeHooksStrategy();

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
