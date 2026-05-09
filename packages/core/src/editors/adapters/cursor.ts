import type { AiJsonConfig } from '@a1st/aix-schema';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   CursorRulesStrategy,
   CursorPromptsStrategy,
   CursorHooksStrategy,
} from '../strategies/cursor/index.js';
import { MarkdownAgentsStrategy, StandardMcpStrategy, NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * Cursor editor adapter. Writes rules to `.cursor/rules/*.mdc` (with YAML frontmatter) and MCP
 * config to `.cursor/mcp.json`. Skills are installed into `.aix/skills/{name}/` and symlinked
 * into `.cursor/skills/` since Cursor supports the Agent Skills open standard.
 * Hooks are written to `.cursor/hooks.json`.
 */
export class CursorAdapter extends BaseEditorAdapter {
   readonly name = 'cursor' as const;
   readonly configDir = '.cursor';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Cursor'],
         linux: ['.config/Cursor'],
         win32: ['AppData/Roaming/Cursor'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new CursorRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new StandardMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.cursor/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new CursorPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: 'agents',
      userAgentsDir: '.cursor/agents',
   });
   protected readonly hooksStrategy: HooksStrategy = new CursorHooksStrategy();

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
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            agents = await this.loadAgents(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp),
            hooks = config.hooks;

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, agents, mcp, hooks };
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

      return changes;
   }
}
