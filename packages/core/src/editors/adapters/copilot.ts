import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   CopilotRulesStrategy,
   CopilotMcpStrategy,
   CopilotPromptsStrategy,
   CopilotHooksStrategy,
   CopilotPluginsStrategy,
   CopilotMarketplacesStrategy,
} from '../strategies/copilot/index.js';
import {
   MarkdownAgentsStrategy,
   NativeSkillsStrategy,
} from '../strategies/shared/index.js';
import type {
   EditorStrategyBundle,
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
   PluginsStrategy,
   MarketplacesStrategy,
} from '../strategies/types.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import { installPromptsAsSkills } from '../prompt-skill-installer.js';
import { getGlobalCopilotDir, LEGACY_COPILOT_DIR } from '../strategies/copilot/paths.js';

/**
 * GitHub Copilot editor adapter. Writes rules to `.github/instructions/*.instructions.md`,
 * MCP config to `.mcp.json` (or `.copilot/mcp-config.json` for user scope),
 * skills to `.github/skills/` / `.copilot/skills/`, and hooks to
 * `.github/hooks/hooks.json` / `.copilot/hooks/hooks.json`. Project-scope prompts
 * stay native, while user-scope prompts are converted into skills and installed through Copilot's
 * native skills directories.
 */
export class CopilotAdapter extends BaseEditorAdapter {
   readonly name = 'copilot' as const;
   readonly configDir = '.vscode';

   constructor(private readonly globalDir: string = getGlobalCopilotDir()) {
      super();

      this.rulesStrategy = new CopilotRulesStrategy(globalDir);
      this.mcpStrategy = new CopilotMcpStrategy(globalDir);
      this.skillsStrategy = new NativeSkillsStrategy({
         editorSkillsDir: '.github/skills',
         userEditorSkillsDir: `${globalDir}/skills`,
      });
      this.agentsStrategy = new MarkdownAgentsStrategy({
         projectAgentsDir: '../.github/agents',
         userAgentsDir: `${globalDir}/agents`,
         extraFrontmatter: (agent) => {
            return { ...(agent.mcp ? { 'mcp-servers': agent.mcp } : {}), ...agent.editor?.copilot };
         },
      });
      this.hooksStrategy = new CopilotHooksStrategy(globalDir);
      this.pluginsStrategy = new CopilotPluginsStrategy(globalDir);
      this.marketplacesStrategy = new CopilotMarketplacesStrategy(globalDir);
   }

   getLegacyUserStrategies(): EditorStrategyBundle | undefined {
      return this.globalDir === LEGACY_COPILOT_DIR ? undefined : new CopilotAdapter(LEGACY_COPILOT_DIR).getStrategyBundle();
   }

   getGlobalDataPaths(): Record<string, string[]> {
      const candidates = [ this.globalDir, LEGACY_COPILOT_DIR ];

      return {
         darwin: [...candidates, 'Library/Application Support/Code'],
         linux: [...candidates, '.config/Code'],
         win32: [...candidates, 'AppData/Roaming/Code'],
      };
   }

   async detect(projectRoot: string): Promise<boolean> {
      const candidates = [
         '.mcp.json',
         '.github/mcp.json',
         '.github/copilot-instructions.md',
         '.github/instructions',
         '.github/prompts',
         '.github/skills',
         '.github/hooks',
      ];

      for (const candidate of candidates) {
         try {
            // eslint-disable-next-line no-await-in-loop -- Sequential: first-match lookup
            await getRuntimeAdapter().fs.access(
               join(projectRoot, candidate),
               getRuntimeAdapter().fs.constants.F_OK,
            );
            return true;
         } catch {
            // Try the next Copilot-managed path.
         }
      }

      return false;
   }

   protected readonly rulesStrategy: RulesStrategy;
   protected readonly mcpStrategy: McpStrategy;
   protected readonly skillsStrategy: SkillsStrategy;
   protected readonly promptsStrategy: PromptsStrategy = new CopilotPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy;
   protected readonly hooksStrategy: HooksStrategy;
   protected readonly pluginsStrategy: PluginsStrategy;
   protected readonly marketplacesStrategy: MarketplacesStrategy;

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
      });
      const prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            agents = await this.loadAgents(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp),
            hooks = config.hooks,
            shouldConvertPromptInstalls = this.shouldConvertPromptsToSkills(options.targetScope),
            promptSkillChanges = shouldConvertPromptInstalls
               ? await installPromptsAsSkills({
                  prompts,
                  skills,
                  skillsStrategy: this.skillsStrategy,
                  projectRoot,
                  applyOptions: options,
               })
               : [];

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return {
         rules,
         prompts: shouldConvertPromptInstalls ? [] : prompts,
         agents,
         mcp,
         hooks,
         plugins: config.plugins,
         marketplaces: config.marketplaces,
      };
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

   private shouldConvertPromptsToSkills(targetScope: ApplyOptions['targetScope'] = 'project'): boolean {
      if (targetScope === 'user') {
         return true;
      }

      return this.promptsStrategy.isGlobalOnly?.() === true || this.promptsStrategy.getPromptsDir().length === 0;
   }
}
