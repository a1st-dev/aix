import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions, UnsupportedFeatures } from '../types.js';
import { ZedRulesStrategy, ZedMcpStrategy, ZedPromptsStrategy } from '../strategies/zed/index.js';
import { PointerSkillsStrategy, NoAgentsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
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

/**
 * Zed editor adapter. Writes rules to `.rules` at project root and MCP config to
 * `.zed/settings.json`. Skills are installed to `.aix/skills/{name}/` with pointer rules since Zed
 * doesn't have native Agent Skills support. Prompts are converted to skills. Zed does not support
 * hooks.
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
   protected readonly skillsStrategy: SkillsStrategy = new PointerSkillsStrategy();
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

      // At user scope, Zed has no global rules file. Drop all rules so nothing is written to
      // the project-local .rules file. Skills are still installed to ~/.aix/skills/, but Zed
      // cannot activate them without a project-local .rules pointer -- a known limitation
      // reported via getTargetScopeLimitations.
      const effectiveRules = options.targetScope === 'user' ? [] : rules;

      this.pendingSkillChanges = [...skillChanges, ...promptSkillChanges];
      return { rules: effectiveRules, prompts: [], mcp };
   }

   override getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures {
      const unsupported = super.getUnsupportedFeatures(config);

      delete unsupported.prompts;

      return unsupported;
   }

   /**
    * Override planChanges to write all rules to a single .rules file at project root.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      _options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [],
            configDir = join(projectRoot, this.configDir);

      // Rules - Zed uses a single .rules file at project root. Skill installs for Zed also need
      // pointer rules, so skills-only flows still write `.rules` when skill-derived rules exist.
      if ((scopes.includes('rules') || scopes.includes('skills')) && editorConfig.rules.length > 0) {
         const rulesPath = join(projectRoot, '.rules'),
               content = this.formatRulesFile(editorConfig.rules),
               existing = await this.readExisting(rulesPath),
               action = this.determineAction(existing, content);

         changes.push({ path: rulesPath, action, content, category: 'rule' });
      }

      // MCP config (JSON file - merge by default)
      if (scopes.includes('mcp') && this.mcpStrategy.isSupported()) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const globalMcpPath = this.mcpStrategy.getGlobalMcpConfigPath(),
                  mcpPath = _options.targetScope === 'user' && globalMcpPath
                     ? join(getRuntimeAdapter().os.homedir(), globalMcpPath)
                     : join(configDir, this.mcpStrategy.getConfigPath()),
                  change = await this.planJsonFileChange(
                     mcpPath,
                     this.mcpStrategy.formatConfig(editorConfig.mcp),
                     _options,
                  );

            changes.push({ ...change, category: 'mcp' });
         }
      }

      // Add skill changes
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
