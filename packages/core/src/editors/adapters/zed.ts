import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions, UnsupportedFeatures } from '../types.js';
import { ZedRulesStrategy, ZedMcpStrategy, ZedPromptsStrategy } from '../strategies/zed/index.js';
import { NativeSkillsStrategy, NoAgentsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
import { installPromptsAsSkills } from '../prompt-skill-installer.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import { upsertManagedSection } from '../section-managed-markdown.js';

/**
 * Zed editor adapter. Writes rules to `.rules` at project scope or `~/.config/zed/AGENTS.md` at
 * user scope. MCP config goes to `.zed/settings.json`. Skills use native Zed Agent Skills at
 * `.agents/skills/{name}/` (managed in `.aix/skills/` with symlinks). Prompts are converted to
 * skills. Zed does not support hooks.
 */
export class ZedAdapter extends BaseEditorAdapter {
   readonly name = 'zed' as const;
   readonly configDir = '.zed';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['Library/Application Support/Zed'],
         linux: ['.config/zed'],
         win32: ['AppData/Roaming/Zed'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new ZedRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new ZedMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({ editorSkillsDir: '.agents/skills' });
   protected readonly promptsStrategy: PromptsStrategy = new ZedPromptsStrategy();
   protected readonly agentsStrategy: AgentsStrategy = new NoAgentsStrategy();
   protected readonly hooksStrategy: HooksStrategy = new NoHooksStrategy();

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
            }),
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp);

      const promptSkillChanges = await installPromptsAsSkills({
         prompts,
         skills,
         skillsStrategy: this.skillsStrategy,
         projectRoot,
         applyOptions: options,
      });

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return { rules, prompts: [], mcp };
   }

   override getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures {
      const unsupported = super.getUnsupportedFeatures(config);

      delete unsupported.prompts;

      return unsupported;
   }

   /**
    * Override planChanges to write rules to a single `.rules` file at project scope or to
    * `~/.config/zed/AGENTS.md` at user scope.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [],
            configDir = join(projectRoot, this.configDir),
            targetScope = options.targetScope ?? 'project';

      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         if (targetScope === 'user') {
            const globalRulesPath = this.rulesStrategy.getGlobalRulesPath()!,
                  filePath = join(getRuntimeAdapter().os.homedir(), globalRulesPath),
                  managedContent = editorConfig.rules
                     .map((rule) => this.rulesStrategy.formatRule(rule))
                     .join('\n\n'),
                  existing = await this.readExisting(filePath),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: filePath, action, content, category: 'rule' });
         } else {
            const rulesPath = join(projectRoot, '.rules'),
                  content = this.formatRulesFile(editorConfig.rules),
                  existing = await this.readExisting(rulesPath),
                  action = this.determineAction(existing, content);

            changes.push({ path: rulesPath, action, content, category: 'rule' });
         }
      }

      // MCP config (JSON file - merge by default)
      if (scopes.includes('mcp') && this.mcpStrategy.isSupported()) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const globalMcpPath = this.mcpStrategy.getGlobalMcpConfigPath(),
                  mcpPath = targetScope === 'user' && globalMcpPath
                     ? join(getRuntimeAdapter().os.homedir(), globalMcpPath)
                     : join(configDir, this.mcpStrategy.getConfigPath()),
                  change = await this.planJsonFileChange(
                     mcpPath,
                     this.mcpStrategy.formatConfig(editorConfig.mcp),
                     options,
                  );

            changes.push({ ...change, category: 'mcp' });
         }
      }

      // Add skill changes (copy to .aix/skills/ + symlink to .agents/skills/)
      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      return changes;
   }

   /**
    * Format all rules into a single .rules file.
    */
   private formatRulesFile(rules: EditorConfig['rules']): string {
      const lines: string[] = [];

      for (const rule of rules) {
         lines.push(this.rulesStrategy.formatRule(rule), '');
      }

      return lines.join('\n');
   }
}
