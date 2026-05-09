import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import {
   CopilotRulesStrategy,
   CopilotMcpStrategy,
   CopilotPromptsStrategy,
   CopilotHooksStrategy,
} from '../strategies/copilot/index.js';
import { MarkdownAgentsStrategy, NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import { installPromptsAsSkills } from '../prompt-skill-installer.js';

/**
 * GitHub Copilot editor adapter. Writes rules to `.github/instructions/*.instructions.md`,
 * MCP config to `.mcp.json` (or `~/.copilot/mcp-config.json` for user scope), skills to
 * `.github/skills/` / `~/.copilot/skills/`, and hooks to `.github/hooks/hooks.json` /
 * `~/.copilot/hooks/hooks.json`. Project-scope prompts stay native, while user-scope prompts are
 * converted into skills and installed through Copilot's native skills directories.
 */
export class CopilotAdapter extends BaseEditorAdapter {
   readonly name = 'copilot' as const;
   readonly configDir = '.vscode';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.copilot', 'Library/Application Support/Code'],
         linux: ['.copilot', '.config/Code'],
         win32: ['.copilot', 'AppData/Roaming/Code'],
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

   protected readonly rulesStrategy: RulesStrategy = new CopilotRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new CopilotMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.github/skills',
      userEditorSkillsDir: '.copilot/skills',
   });
   protected readonly promptsStrategy: PromptsStrategy = new CopilotPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new MarkdownAgentsStrategy({
      projectAgentsDir: '../.github/agents',
      userAgentsDir: '.copilot/agents',
      extraFrontmatter: (agent) => ({
         ...(agent.mcp ? { 'mcp-servers': agent.mcp } : {}),
         ...agent.editor?.copilot,
      }),
   });
   protected readonly hooksStrategy: HooksStrategy = new CopilotHooksStrategy();

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
      return { rules, prompts: shouldConvertPromptInstalls ? [] : prompts, agents, mcp, hooks };
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
