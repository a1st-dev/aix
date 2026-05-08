import type { AiJsonConfig, HooksConfig } from '@a1st/aix-schema';
import { join } from 'pathe';
import { BaseEditorAdapter, filterMcpConfig } from './base.js';
import { deepMergeJson } from '../../json.js';
import type { EditorConfig, EditorRule, FileChange, ApplyOptions } from '../types.js';
import {
   GeminiRulesStrategy,
   GeminiMcpStrategy,
   GeminiPromptsStrategy,
   GeminiHooksStrategy,
} from '../strategies/gemini/index.js';
import { NativeSkillsStrategy } from '../strategies/shared/index.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { upsertManagedSection } from '../section-managed-markdown.js';
import { getRuntimeAdapter } from '../../runtime/index.js';

/**
 * Gemini CLI editor adapter. Writes rules to `GEMINI.md` at the project root using
 * section-managed markdown (preserving user content). MCP config and hooks both go to
 * `.gemini/settings.json`. Skills are installed into `.aix/skills/{name}/` and symlinked
 * into `.gemini/skills/`. Prompts are written as TOML files to `.gemini/commands/`.
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
   protected readonly hooksStrategy: HooksStrategy = new GeminiHooksStrategy();

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
            mcp = filterMcpConfig(config.mcp),
            hooks = config.hooks;

      this.pendingSkillChanges = skillChanges;
      return { rules, prompts, mcp, hooks };
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
            const geminiPath = join(
                     getRuntimeAdapter().os.homedir(),
                     this.rulesStrategy.getGlobalRulesPath() ?? '.gemini/GEMINI.md',
                  ),
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

      const configDir = join(projectRoot, this.configDir),
            mcpPath = options.targetScope === 'user'
               ? join(
                  getRuntimeAdapter().os.homedir(),
                  this.mcpStrategy.getGlobalMcpConfigPath() ?? '.gemini/settings.json',
               )
               : join(configDir, this.mcpStrategy.getConfigPath()),
            hooksPath = options.targetScope === 'user'
               ? join(
                  getRuntimeAdapter().os.homedir(),
                  this.hooksStrategy.getGlobalConfigPath() ?? '.gemini/settings.json',
               )
               : join(configDir, this.hooksStrategy.getConfigPath());

      // MCP config (handled by base class via mcpStrategy)
      if (scopes.includes('mcp') && this.mcpStrategy.isSupported()) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const change = await this.planJsonFileChange(
               mcpPath,
               this.mcpStrategy.formatConfig(editorConfig.mcp),
               options,
            );

            changes.push({ ...change, category: 'mcp' });
         }
      }

      // Hooks - share `.gemini/settings.json` with MCP. Merge into any pending change.
      if (scopes.includes('editors') && this.hooksStrategy.isSupported() && editorConfig.hooks) {
         const hookEvents = Object.keys(editorConfig.hooks);

         if (hookEvents.length > 0) {
            await this.planGeminiHooksChange(editorConfig.hooks, hooksPath, options, changes);
         }
      }

      // Prompts (handled similarly to base class)
      if (
         (scopes.includes('editors') || scopes.includes('prompts')) &&
         this.promptsStrategy.isSupported() &&
         editorConfig.prompts.length > 0
      ) {
         const globalPromptsPath = this.promptsStrategy.getGlobalPromptsPath(),
               promptsDir = options.targetScope === 'user' && globalPromptsPath
                  ? join(getRuntimeAdapter().os.homedir(), globalPromptsPath)
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

   /**
    * Plan the hooks update for `.gemini/settings.json`. If MCP already produced a
    * pending change at the same path, merge into that pending content instead of
    * re-reading disk so both writes survive a single install.
    *
    * The original change keeps its category (typically `mcp`) because the file's
    * primary category is determined by the first thing that wrote to it. The hook
    * content piggybacks. This avoids the change being silently relabeled to `hook`
    * and losing visibility of the MCP write in audit / telemetry consumers.
    */
   private async planGeminiHooksChange(
      hooks: HooksConfig,
      settingsPath: string,
      options: ApplyOptions,
      changes: FileChange[],
   ): Promise<void> {
      const formattedHooks = this.hooksStrategy.formatConfig(hooks),
            parsedHooks = JSON.parse(formattedHooks) as { hooks?: Record<string, unknown> };

      if (!parsedHooks.hooks || Object.keys(parsedHooks.hooks).length === 0) {
         return;
      }

      const existingChange = changes.find((entry) => entry.path === settingsPath);

      if (existingChange?.content !== undefined) {
         try {
            const pendingJson = JSON.parse(existingChange.content) as Record<string, unknown>,
                  hooksJson = parsedHooks as Record<string, unknown>,
                  merged = deepMergeJson(pendingJson, hooksJson),
                  mergedContent = JSON.stringify(merged, null, 2) + '\n',
                  existingDisk = await this.readExisting(settingsPath);

            existingChange.content = mergedContent;
            existingChange.action = this.determineAction(existingDisk, mergedContent);
            return;
         } catch {
            // Fall through to overwrite if existingChange.content was not valid JSON.
         }
      }
      const change = await this.planJsonFileChange(settingsPath, formattedHooks, options);

      changes.push({ ...change, category: 'hook' });
   }
}
