import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions } from '../types.js';
import {
   OpenCodeMcpStrategy,
   OpenCodePromptsStrategy,
   OpenCodeRulesStrategy,
} from '../strategies/opencode/index.js';
import { MarkdownAgentsStrategy, NativeSkillsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
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
 * OpenCode adapter. Writes project rules to `AGENTS.md`, MCP config to `opencode.json`, commands
 * to `.opencode/commands/`, and native skills to `.opencode/skills/`.
 */
export class OpenCodeAdapter extends BaseEditorAdapter {
   readonly name = 'opencode' as const;
   readonly configDir = '.opencode';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.config/opencode'],
         linux: ['.config/opencode'],
         win32: ['AppData/Roaming/opencode'],
      };
   }

   override async detect(projectRoot: string): Promise<boolean> {
      const configDir = join(projectRoot, this.configDir),
            configPath = join(projectRoot, 'opencode.json'),
            jsoncConfigPath = join(projectRoot, 'opencode.jsonc');

      return (
         getRuntimeAdapter().fs.existsSync(configDir) ||
         getRuntimeAdapter().fs.existsSync(configPath) ||
         getRuntimeAdapter().fs.existsSync(jsoncConfigPath)
      );
   }

   protected readonly rulesStrategy: RulesStrategy = new OpenCodeRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new OpenCodeMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.opencode/skills',
      userEditorSkillsDir: '.config/opencode/skills',
   });

   protected readonly promptsStrategy: PromptsStrategy = new OpenCodePromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: 'agents',
      userAgentsDir: '.config/opencode/agents',
      extraFrontmatter: (agent) => agent.editor?.opencode ?? {},
   });
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
               targetScope: options.targetScope,
            }),
            prompts = await this.loadPrompts(config, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            agents = await this.loadAgents(config, projectRoot, {
               configBaseDir: options.configBaseDir,
            }),
            mcp = filterMcpConfig(config.mcp);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, agents, mcp };
   }

   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes = await super.planChanges(editorConfig, projectRoot, scopes, options);

      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         const managedRuleChanges = await this.planRuleChanges(editorConfig.rules, projectRoot, options),
               nonRuleChanges = changes.filter((change) => change.category !== 'rule');

         changes.splice(0, changes.length, ...managedRuleChanges, ...nonRuleChanges);
      }

      if (scopes.includes('skills')) {
         changes.unshift(...this.pendingSkillChanges);
      }
      this.pendingSkillChanges = [];

      return changes;
   }

   private async planRuleChanges(
      rules: EditorRule[],
      projectRoot: string,
      options: ApplyOptions,
   ): Promise<FileChange[]> {
      const rulesPath = options.targetScope === 'user'
               ? join(
                  getRuntimeAdapter().os.homedir(),
                  this.rulesStrategy.getGlobalRulesPath() ?? '.config/opencode/AGENTS.md',
               )
               : join(projectRoot, 'AGENTS.md'),
            managedContent = this.formatManagedRules(rules),
            existing = await this.readExisting(rulesPath),
            content = upsertManagedSection(existing, managedContent),
            action = this.determineAction(existing, content);

      return [{ path: rulesPath, action, content, category: 'rule' }];
   }

   private formatManagedRules(rules: EditorRule[]): string {
      const parts: string[] = [];

      for (const rule of rules) {
         parts.push(this.rulesStrategy.formatRule(rule));
      }

      return parts.join('\n\n');
   }
}
