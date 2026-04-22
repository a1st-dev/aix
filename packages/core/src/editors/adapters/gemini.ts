import type { AiJsonConfig } from '@a1st/aix-schema';
import { homedir } from 'node:os';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions } from '../types.js';
import { GeminiRulesStrategy, GeminiMcpStrategy, GeminiPromptsStrategy } from '../strategies/gemini/index.js';
import { NativeSkillsStrategy, NoHooksStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';

/**
 * Gemini CLI editor adapter. Writes rules to `GEMINI.md` at the project root using
 * section-managed markdown (preserving user content). MCP config goes to
 * `.gemini/settings.json`. Skills are installed into `.aix/skills/{name}/` and symlinked
 * into `.gemini/skills/`. Prompts are written as TOML files to `.gemini/commands/`.
 * Gemini does not support hooks.
 */
export class GeminiAdapter extends BaseEditorAdapter {
   readonly name = 'gemini' as const;
   readonly configDir = '.gemini';

   getGlobalDataPaths(): Record<string, string[]> {
      return {
         darwin: ['.gemini'],
         linux: ['.gemini'],
         win32: ['.gemini'],
      };
   }

   protected readonly rulesStrategy: RulesStrategy = new GeminiRulesStrategy();
   protected readonly mcpStrategy: McpStrategy = new GeminiMcpStrategy();
   protected readonly skillsStrategy: SkillsStrategy = new NativeSkillsStrategy({
      editorSkillsDir: '.gemini/skills',
      userEditorSkillsDir: '.gemini/skills',
   });

   protected readonly promptsStrategy: PromptsStrategy = new GeminiPromptsStrategy();
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
            prompts = await this.loadPrompts(config, projectRoot, { configBaseDir: options.configBaseDir }),
            mcp = filterMcpConfig(config.mcp);

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp };
   }

   /**
    * Override planChanges to write rules to GEMINI.md using section-managed markdown.
    * This preserves any user-maintained content in the file.
    */
   protected override async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [];

      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         if (options.targetScope === 'user') {
            const geminiPath = join(homedir(), this.rulesStrategy.getGlobalRulesPath() ?? '.gemini/GEMINI.md'),
                  managedContent = this.formatManagedRules(editorConfig.rules),
                  existing = await this.readExisting(geminiPath),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: geminiPath, action, content, category: 'rule' });
         } else {
            const geminiPath = join(projectRoot, 'GEMINI.md'),
                  managedContent = this.formatManagedRules(editorConfig.rules),
                  existing = await this.readExisting(geminiPath),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: geminiPath, action, content, category: 'rule' });
         }
      }

      // MCP config (handled by base class via mcpStrategy)
      if (scopes.includes('mcp') && this.mcpStrategy.isSupported()) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const configDir = join(projectRoot, this.configDir),
                  globalMcpPath = this.mcpStrategy.getGlobalMcpConfigPath(),
                  mcpPath = options.targetScope === 'user' && globalMcpPath
                     ? join(homedir(), globalMcpPath)
                     : join(configDir, this.mcpStrategy.getConfigPath()),
                  change = await this.planJsonFileChange(
                     mcpPath,
                     this.mcpStrategy.formatConfig(editorConfig.mcp),
                     options,
                  );

            changes.push({ ...change, category: 'mcp' });
         }
      }

      // Prompts (handled similarly to base class)
      if (
         (scopes.includes('editors') || scopes.includes('prompts')) &&
         this.promptsStrategy.isSupported() &&
         editorConfig.prompts.length > 0
      ) {
         const configDir = join(projectRoot, this.configDir),
               globalPromptsPath = this.promptsStrategy.getGlobalPromptsPath(),
               promptsDir = options.targetScope === 'user' && globalPromptsPath
                  ? join(homedir(), globalPromptsPath)
                  : join(configDir, this.promptsStrategy.getPromptsDir()),
               ext = this.promptsStrategy.getFileExtension();

         const promptChanges = await Promise.all(
            editorConfig.prompts.map(async (prompt) => {
               const fileName = this.sanitizeFileName(this.derivePromptName(prompt)) + ext,
                     filePath = join(promptsDir, fileName),
                     content = this.promptsStrategy.formatPrompt(prompt),
                     existing = await this.readExisting(filePath),
                     action = this.determineAction(existing, content);

               return { path: filePath, action, content, category: 'workflow' as const };
            }),
         );

         changes.push(...promptChanges);
      }

      // Add skill changes
      changes.unshift(...this.pendingSkillChanges);
      this.pendingSkillChanges = [];

      return changes;
   }

   /**
    * Format rules into managed section content (without the section markers — those are added
    * by upsertManagedSection). Does not include a file header since it's the user's file.
    */
   private formatManagedRules(rules: EditorRule[]): string {
      const parts: string[] = [];

      for (const rule of rules) {
         parts.push(this.rulesStrategy.formatRule(rule));
      }

      return parts.join('\n\n');
   }
}
