import type { AiJsonConfig, HooksConfig } from '@a1st/aix-schema';
import { basename, join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions, EditorRule } from '../types.js';
import {
   ClaudeCodeRulesStrategy,
   ClaudeCodeMcpStrategy,
   ClaudeCodePromptsStrategy,
   ClaudeCodeHooksStrategy,
} from '../strategies/claude-code/index.js';
import { MarkdownAgentsStrategy, NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';
import { getRuntimeAdapter } from '../../runtime/index.js';

/**
 * Claude Code editor adapter. Writes rules to `.claude/rules/*.md` and MCP config to
 * `.mcp.json` (project root). Skills are installed into `.aix/skills/{name}/` and symlinked into
 * `.claude/skills/` since Claude Code has native Agent Skills support.
 * Hooks are written to `.claude/settings.json`.
 */
export class ClaudeCodeAdapter extends BaseEditorAdapter {
   readonly name = 'claude-code' as const;
   readonly configDir = '.claude';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.claude', '.claude.json'],
         linux: ['.claude', '.claude.json'],
         win32: ['.claude', '.claude.json'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new ClaudeCodeRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new ClaudeCodeMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.claude/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new ClaudeCodePromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: 'agents',
      userAgentsDir: '.claude/agents',
   });
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
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            agents = await this.loadAgents(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp),
            hooks = this.extractHooks(config);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, agents, mcp, hooks };
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
      const targetScope = options.targetScope ?? 'project',
            shouldWriteUserRules = targetScope === 'user' && scopes.includes('rules'),
            baseScopes = shouldWriteUserRules ? scopes.filter((scope) => scope !== 'rules') : scopes;

      // Get base changes from parent (rules, MCP, prompts, hooks)
      const changes = await super.planChanges(editorConfig, projectRoot, baseScopes, options);

      if (shouldWriteUserRules && editorConfig.rules.length > 0) {
         changes.unshift(...await this.planUserRuleChanges(editorConfig.rules));
      }

      // Add skill changes only if skills scope is included
      if (scopes.includes('skills')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      return changes;
   }

   /**
    * User-level Claude Code rules stay as separate files in `~/.claude/rules/`.
    * `~/.claude/CLAUDE.md` only gets an aix-managed import list so user content survives.
    */
   private async planUserRuleChanges(rules: EditorRule[]): Promise<FileChange[]> {
      const homeDir = getRuntimeAdapter().os.homedir(),
            rulesDir = join(homeDir, this.configDir, this.rulesStrategy.getRulesDir()),
            claudePath = join(
               homeDir,
               this.rulesStrategy.getGlobalRulesPath() ?? join(this.configDir, 'CLAUDE.md'),
            ),
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
            ),
            managedContent = this.formatUserRuleImports(ruleChanges),
            existing = await this.readExisting(claudePath),
            content = upsertManagedSection(existing, managedContent),
            action = this.determineAction(existing, content);

      return [
         { path: claudePath, action, content, category: 'rule' },
         ...ruleChanges,
      ];
   }

   private formatUserRuleImports(ruleChanges: FileChange[]): string {
      const importLines = ruleChanges.map((change) => {
         return `@rules/${basename(change.path)}`;
      });

      return ['## aix rules', '', ...importLines].join('\n');
   }
}
