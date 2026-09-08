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
import {
   NoAgentsStrategy,
   NoMarketplacesStrategy,
   PluginCompatibilityStrategy,
} from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
   PluginsStrategy,
   MarketplacesStrategy,
} from '../strategies/types.js';

/**
 * Windsurf editor adapter. Writes rules to `.windsurf/rules/*.md`. Skills are installed
 * into `.aix/skills/{name}/` and symlinked into `.windsurf/skills/{name}/`.
 * Hooks are written to `.windsurf/hooks.json` (project) and
 * `~/.codeium/windsurf/hooks.json` (user). MCP is global-only
 * (`~/.codeium/windsurf/mcp_config.json`) and requires user confirmation to modify.
 */
export class WindsurfAdapter extends BaseEditorAdapter {
   readonly name = 'windsurf' as const;
   readonly configDir = '.windsurf';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Windsurf'],
         linux: ['.config/Windsurf'],
         win32: ['AppData/Roaming/Windsurf'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new WindsurfRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new WindsurfMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new WindsurfSkillsStrategy();
   protected readonly promptsStrategy: PromptsStrategy = new WindsurfPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new NoAgentsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new WindsurfHooksStrategy();
   protected readonly pluginsStrategy: PluginsStrategy = new PluginCompatibilityStrategy();
   protected readonly marketplacesStrategy: MarketplacesStrategy = new NoMarketplacesStrategy();

   // Store skill changes from generateConfig for use in planChanges
   private pendingSkillChanges: FileChange[] = [];

   async generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<EditorConfig> {
      const resolvedConfig = await this.unpackCompatibilityPlugins(config, projectRoot, options),
            { rules, skillChanges } = await this.loadRules(resolvedConfig, projectRoot, {
               dryRun: options.dryRun,
               scopes: options.scopes,
               configBaseDir: options.configBaseDir,
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(resolvedConfig, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(resolvedConfig.mcp),
            hooks = resolvedConfig.hooks;

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp, hooks, plugins: config.plugins };
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
