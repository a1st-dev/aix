import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions } from '../types.js';
import {
   AntigravityRulesStrategy,
   AntigravityMcpStrategy,
   AntigravityPromptsStrategy,
   AntigravityHooksStrategy,
} from '../strategies/antigravity/index.js';
import {
   MarkdownAgentsStrategy,
   NativeSkillsStrategy,
   formatPlainMarkdownRule,
} from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';

/**
 * Google Antigravity editor adapter.
 * Uses `.agents/` as the primary configuration directory:
 * - Rules: `.agents/rules/*.md` with YAML frontmatter triggers, plus `AGENTS.md` managed section
 * - MCP config: `.agents/mcp_config.json`
 * - Skills: `.agents/skills/{name}/`
 * - Workflows: `.agents/workflows/*.md`
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
            '/Applications/Antigravity.app',
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
   });

   protected readonly promptsStrategy: PromptsStrategy = new AntigravityPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: 'agents',
      userAgentsDir: '.gemini/config/agents',
      extraFrontmatter: (agent) => agent.editor?.antigravity ?? {},
   });
   protected readonly hooksStrategy: HooksStrategy = new AntigravityHooksStrategy();

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
