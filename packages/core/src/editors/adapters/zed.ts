import type { AiJsonConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, FileChange, ApplyOptions } from '../types.js';
import { ZedRulesStrategy, ZedMcpStrategy, ZedPromptsStrategy } from '../strategies/zed/index.js';
import { PointerSkillsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';

/**
 * Zed editor adapter. Writes rules to `.rules` at project root and MCP config to
 * `.zed/settings.json`. Skills are installed to `.aix/skills/{name}/` with pointer rules since Zed
 * doesn't have native Agent Skills support. Zed does not support hooks or prompts.
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
            }),
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp };
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

      // Rules - Zed uses a single .rules file at project root
      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
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
            const mcpPath = join(configDir, this.mcpStrategy.getConfigPath()),
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
