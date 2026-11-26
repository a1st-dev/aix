import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions, TargetScopeLimitations, UnsupportedFeatures } from '../types.js';
import {
   AntigravityRulesStrategy,
   AntigravityMcpStrategy,
   AntigravityPromptsStrategy,
   AntigravityHooksStrategy,
} from '../strategies/antigravity/index.js';
import { AntigravityPluginsStrategy, isNativeAntigravityPlugin } from '../strategies/antigravity/plugins.js';
import { isDisabledConfigValue } from '../../type-guards.js';
import {
   MarkdownAgentsStrategy,
   NativeSkillsStrategy,
   NoMarketplacesStrategy,
   formatPlainMarkdownRule,
} from '../strategies/shared/index.js';
import { installPromptsAsSkills } from '../prompt-skill-installer.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
   MarketplacesStrategy,
} from '../strategies/types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';

/**
 * Google Antigravity editor adapter.
 * Uses `.agents/` as the primary configuration directory:
 * - Rules: `.agents/rules/*.md` with YAML frontmatter triggers, plus `AGENTS.md` managed section
 * - MCP config: `.agents/mcp_config.json`
 * - Skills: `.agents/skills/{name}/`
 * - Prompts: converted to Agent Skills in `.agents/skills/` (legacy `.agents/workflows/` deprecated)
 * - Agents: `.agents/agents/*.md`
 * - Hooks: `.agents/hooks.json`
 */
export class AntigravityAdapter extends BaseEditorAdapter {
   readonly name = 'antigravity' as const;
   readonly configDir = '.agents';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: [
            '.gemini/config',
            '.gemini/antigravity',
            '.antigravity',
            'Library/Application Support/Antigravity',
         ],
         linux: [
            '.gemini/config',
            '.gemini/antigravity',
            '.config/Antigravity',
         ],
         win32: [
            '.gemini/config',
            '.gemini/antigravity',
            'AppData/Roaming/Antigravity',
         ],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new AntigravityRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new AntigravityMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.agents/skills',
      userEditorSkillsDir: '.gemini/config/skills',
      globalImportDirs: [ '.agents/skills', '.gemini/config/skills', '.gemini/skills', '.gemini/antigravity-cli/skills' ],
   });

   protected readonly promptsStrategy: PromptsStrategy = new AntigravityPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: 'agents',
      userAgentsDir: '.gemini/config/agents',
      extraFrontmatter: (agent) => agent.editor?.antigravity ?? {},
   });
   protected readonly hooksStrategy: HooksStrategy = new AntigravityHooksStrategy();
   protected readonly pluginsStrategy = new AntigravityPluginsStrategy();
   protected readonly marketplacesStrategy: MarketplacesStrategy = new NoMarketplacesStrategy();

   private pendingSkillChanges: FileChange[] = [];

   async generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<EditorConfig> {
      const configuredPlugins = config.plugins ?? {},
            compatibilityPlugins = Object.fromEntries(Object.entries(configuredPlugins).filter(([, plugin]) => {
               return !isNativeAntigravityPlugin(plugin);
            })),
            installPlugins = !options.scopes || options.scopes.includes('plugins') || options.scopes.includes('editors'),
            plugins = options.targetScope === 'user' && installPlugins
               ? this.pluginsStrategy.getUserRegistrations(configuredPlugins, options.configBaseDir ?? projectRoot)
               : {},
            resolvedConfig = await this.unpackCompatibilityPlugins({ ...config, plugins: compatibilityPlugins }, projectRoot, options),
            { rules, skillChanges, skills } = await this.loadRules(resolvedConfig, projectRoot, {
               dryRun: options.dryRun,
               scopes: options.scopes,
               configBaseDir: options.configBaseDir,
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(resolvedConfig, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            agents = await this.loadAgents(resolvedConfig, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            mcp = filterMcpConfig(resolvedConfig.mcp),
            hooks = resolvedConfig.hooks;

      const promptSkillChanges = await installPromptsAsSkills({
         prompts,
         skills,
         skillsStrategy: this.skillsStrategy,
         projectRoot,
         applyOptions: options,
      });

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return { rules, prompts: [], agents, mcp, hooks, plugins };
   }

   protected override usesCompatibilityPlugins(): boolean {
      return true;
   }

   override getTargetScopeLimitations(config: AiJsonConfig, targetScope: 'project' | 'user'): TargetScopeLimitations {
      const limitations = super.getTargetScopeLimitations(config, targetScope),
            plugins = Object.entries(config.plugins ?? {}).filter(([, plugin]) => {
               return !isDisabledConfigValue(plugin) && isNativeAntigravityPlugin(plugin) !== (targetScope === 'user');
            }).map(([name]) => {
               return name;
            });

      if (plugins.length === 0) {
         delete limitations.plugins;
      } else {
         const reason = targetScope === 'user'
            ? 'Antigravity needs an opt-in native local plugin at user scope'
            : 'aix supports native Antigravity plugin registration at user scope';

         limitations.plugins = { reason, plugins };
      }
      return limitations;
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
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      // Add skill changes captured during generateConfig
      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      // If AGENTS.md exists at project root and rules are targeted, keep its managed section updated
      if (
         scopes.includes('rules') &&
         editorConfig.rules.length > 0 &&
         options.targetScope !== 'user'
      ) {
         const agentsMdPath = join(projectRoot, 'AGENTS.md'),
               existing = await this.readExisting(agentsMdPath);

         if (existing !== null) {
            const managedContent = this.formatManagedRules(editorConfig.rules),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: agentsMdPath, action, content, category: 'rule' });
         }
      }

      return changes;
   }

   private formatManagedRules(rules: EditorRule[]): string {
      const parts: string[] = [];

      for (const rule of rules) {
         parts.push(formatPlainMarkdownRule(rule, '##'));
      }

      return parts.join('\n\n');
   }
}
