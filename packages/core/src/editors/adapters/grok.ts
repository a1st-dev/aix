import type { AiJsonConfig, ParsedSkill } from '@a1st/aix-schema';
import { join } from 'pathe';
import { parseTOML, stringifyTOML } from 'confbox';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type {
   EditorConfig,
   EditorPrompt,
   EditorRule,
   FileChange,
   ApplyOptions,
   UnsupportedFeatures,
} from '../types.js';
import {
   GrokRulesStrategy,
   GrokPromptsStrategy,
   GrokMcpStrategy,
   GrokHooksStrategy,
} from '../strategies/grok/index.js';
import {
   NativeSkillsStrategy,
   NoAgentsStrategy,
   NoMarketplacesStrategy,
   PluginCompatibilityStrategy,
} from '../strategies/shared/index.js';
import { installPromptsAsSkills } from '../prompt-skill-installer.js';
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
import { isRecord } from '../../type-guards.js';
import { getRuntimeAdapter } from '../../runtime/index.js';

/**
 * Grok CLI editor adapter. Grok Build CLI uses `.grok/` for project configuration and
 * `~/.grok/` for global settings. Rules are stored in `.grok/rules/*.md` (and `~/.grok/rules/*.md`).
 * MCP configuration is stored in TOML format at `.grok/config.toml` or `~/.grok/config.toml`
 * under `[mcp_servers.<name>]`. Skills are installed to `.grok/skills/{name}/`.
 * Prompts are converted to skills during install. Hooks are written to `.grok/hooks.json` or
 * `~/.grok/hooks.json`.
 */
export class GrokAdapter extends BaseEditorAdapter {
   readonly name = 'grok' as const;
   readonly configDir = '.grok';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.grok'],
         linux: ['.grok'],
         win32: ['.grok'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new GrokRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new GrokMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.grok/skills',
      userEditorSkillsDir: '.grok/skills',
   });

   protected readonly promptsStrategy: PromptsStrategy = new GrokPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new NoAgentsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new GrokHooksStrategy();
   protected readonly pluginsStrategy: PluginsStrategy = new PluginCompatibilityStrategy();
   protected readonly marketplacesStrategy: MarketplacesStrategy = new NoMarketplacesStrategy();

   private pendingSkillChanges: FileChange[] = [];

   async generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<EditorConfig> {
      const resolvedConfig = await this.unpackCompatibilityPlugins(config, projectRoot, options),
            { rules, skillChanges, skills } = await this.loadRules(resolvedConfig, projectRoot, {
               dryRun: options.dryRun,
               scopes: options.scopes,
               configBaseDir: options.configBaseDir,
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(resolvedConfig, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            mcp = filterMcpConfig(resolvedConfig.mcp),
            hooks = resolvedConfig.hooks;

      const promptSkillChanges = await this.installPromptSkills(
         prompts,
         skills,
         projectRoot,
         options,
      );

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return { rules, prompts: [], mcp, hooks, plugins: config.plugins };
   }

   override getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures {
      const unsupported = super.getUnsupportedFeatures(config);

      delete unsupported.prompts;

      return unsupported;
   }

   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const targetScope = options.targetScope ?? 'project',
            shouldWriteUserRules = targetScope === 'user' && scopes.includes('rules'),
            shouldWriteMcp = scopes.includes('mcp') && Object.keys(editorConfig.mcp).length > 0,
            baseScopes = scopes
               .filter((scope) => shouldWriteUserRules ? scope !== 'rules' : true)
               .filter((scope) => shouldWriteMcp ? scope !== 'mcp' : true);

      // Get base changes from parent (project rules, hooks, agents)
      const changes = await super.planChanges(editorConfig, projectRoot, baseScopes, options);

      // Handle user rules if targetScope is user
      if (shouldWriteUserRules && editorConfig.rules.length > 0) {
         changes.unshift(...await this.planUserRuleChanges(editorConfig.rules));
      }

      // Handle MCP changes with TOML merge support
      if (shouldWriteMcp) {
         changes.push(...await this.planMcpChanges(editorConfig.mcp, projectRoot, options));
      }

      // Add skill changes if skills, prompts, or editors scope is included
      if (scopes.includes('skills') || scopes.includes('prompts') || scopes.includes('editors')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      return changes;
   }

   private async planUserRuleChanges(rules: EditorRule[]): Promise<FileChange[]> {
      const homeDir = getRuntimeAdapter().os.homedir(),
            rulesDir = join(homeDir, this.configDir, this.rulesStrategy.getRulesDir()),
            ruleChanges = await Promise.all(
               rules.map(async (rule) => {
                  const fileName = this.sanitizeFileName(this.deriveRuleName(rule)) +
                           this.rulesStrategy.getFileExtension(),
                        filePath = join(rulesDir, fileName),
                        content = this.rulesStrategy.formatRule(rule),
                        existing = await this.readExisting(filePath),
                        action = this.determineAction(existing, content);

                  return { path: filePath, action, content, category: 'rule' as const };
               }),
            );

      return ruleChanges;
   }

   private async planMcpChanges(
      mcp: Record<string, import('@a1st/aix-schema').McpServerConfig>,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const mcpEntries = Object.keys(mcp);

      if (mcpEntries.length === 0) {
         return [];
      }

      const targetScope = options.targetScope ?? 'project',
            globalMcpPath = this.mcpStrategy.getGlobalMcpConfigPath(),
            mcpPath = targetScope === 'user' && globalMcpPath
               ? join(getRuntimeAdapter().os.homedir(), globalMcpPath)
               : join(projectRoot, this.configDir, this.mcpStrategy.getConfigPath()),
            existing = await this.readExisting(mcpPath);

      let config: Record<string, unknown> = {};

      if (existing && !options.overwrite) {
         try {
            config = parseTOML(existing) as Record<string, unknown>;
         } catch {
            config = {};
         }
      }

      const formattedMcp = parseTOML(this.mcpStrategy.formatConfig(mcp)) as Record<string, unknown>;

      config.mcp_servers = {
         ...(isRecord(config.mcp_servers) ? config.mcp_servers : {}),
         ...(isRecord(formattedMcp.mcp_servers) ? formattedMcp.mcp_servers : {}),
      };

      const content = stringifyTOML(config),
            action = this.determineAction(existing, content);

      return [{ path: mcpPath, action, content, category: 'mcp', items: mcpEntries }];
   }

   private async installPromptSkills(
      prompts: EditorPrompt[],
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: ApplyOptions,
   ): Promise<FileChange[]> {
      return installPromptsAsSkills({
         prompts,
         skills,
         skillsStrategy: this.skillsStrategy,
         projectRoot,
         applyOptions: options,
      });
   }
}
