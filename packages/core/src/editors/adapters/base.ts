import { mkdir, readFile, writeFile, rm, access, constants, chmod } from 'node:fs/promises';
import { join, dirname, basename } from 'pathe';
import { existsSync } from 'node:fs';
import type { AiJsonConfig, McpServerConfig } from '@a1st/aix-schema';
import type {
   EditorAdapter,
   EditorConfig,
   EditorName,
   ApplyOptions,
   ApplyResult,
   FileChange,
   EditorRule,
   EditorPrompt,
   UnsupportedFeatures,
} from '../types.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   HooksStrategy,
} from '../strategies/types.js';
import { deepMergeJson, mcpConfigMergeResolver } from '../../json.js';
import { loadPrompts as loadPromptsFromConfig, type LoadedPrompt } from '../../prompts/loader.js';
import { mergeRules, type MergedRule } from '../../rules/merger.js';
import { resolveAllSkills } from '../../skills/resolve.js';

/**
 * Filter out `false` values from MCP config (used to disable inherited servers).
 */
export function filterMcpConfig(mcp: AiJsonConfig['mcp']): Record<string, McpServerConfig> {
   if (!mcp) {
      return {};
   }
   const result: Record<string, McpServerConfig> = {};

   for (const [key, value] of Object.entries(mcp)) {
      if (value !== false) {
         result[key] = value;
      }
   }
   return result;
}

/**
 * Base class for editor adapters providing common functionality for detecting editor config
 * directories, writing files atomically, and managing backups. Subclasses provide strategies for
 * rules, MCP, and skills handling.
 */
export abstract class BaseEditorAdapter implements EditorAdapter {
   abstract readonly name: EditorName;
   abstract readonly configDir: string;

   /** Strategy for formatting and writing rules */
   protected abstract readonly rulesStrategy: RulesStrategy;

   /** Strategy for formatting and writing MCP config */
   protected abstract readonly mcpStrategy: McpStrategy;

   /** Strategy for installing skills (native or pointer) */
   protected abstract readonly skillsStrategy: SkillsStrategy;

   /** Strategy for formatting and writing prompts/commands */
   protected abstract readonly promptsStrategy: PromptsStrategy;

   /** Strategy for formatting and writing hooks */
   protected abstract readonly hooksStrategy: HooksStrategy;

   async detect(projectRoot: string): Promise<boolean> {
      const configPath = join(projectRoot, this.configDir);

      try {
         await access(configPath, constants.F_OK);
         return true;
      } catch {
         return false;
      }
   }

   abstract generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options?: ApplyOptions,
   ): Promise<EditorConfig>;

   async apply(
      editorConfig: EditorConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<ApplyResult> {
      const result: ApplyResult = {
         editor: this.name,
         success: true,
         changes: [],
         errors: [],
      };

      const scopes = options.scopes ?? ['rules', 'mcp', 'skills', 'editors'];

      try {
         // Clean the .aix folder if requested (ensures exact match with ai.json)
         if (options.clean && !options.dryRun) {
            await this.cleanAixFolder(projectRoot);
         }

         // Generate file changes
         const changes = await this.planChanges(editorConfig, projectRoot, scopes, options);

         result.changes = changes;

         // If dry-run, don't actually write
         if (options.dryRun) {
            return result;
         }

         // Apply changes atomically
         await this.applyChanges(changes);
      } catch (error) {
         result.success = false;
         result.errors.push(error instanceof Error ? error.message : String(error));
      }

      return result;
   }

   /**
    * Remove the .aix folder to ensure a clean install state.
    * Preserves .aix/.tmp if it exists (for temporary files).
    */
   protected async cleanAixFolder(projectRoot: string): Promise<void> {
      const aixPath = join(projectRoot, '.aix');

      if (!existsSync(aixPath)) {
         return;
      }

      // Remove the .aix folder entirely, then recreate .tmp if needed
      await rm(aixPath, { recursive: true, force: true });
   }

   /**
    * Apply file changes atomically. If any write fails, attempt to rollback.
    * Sequential execution is required here for atomic rollback support.
    */
   protected async applyChanges(changes: FileChange[]): Promise<void> {
      const applied: Array<{ path: string; originalContent: string | null }> = [];

      try {
         for (const change of changes) {
            // Skip unchanged and directory changes (directories are already copied elsewhere)
            if (change.action === 'unchanged' || change.isDirectory) {
               continue;
            }

            // Store original content for rollback
            let originalContent: string | null = null;

            if (existsSync(change.path)) {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               originalContent = await readFile(change.path, 'utf-8');
            }
            applied.push({ path: change.path, originalContent });

            if (change.action === 'delete') {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await rm(change.path, { force: true });
            } else {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await mkdir(dirname(change.path), { recursive: true });
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await writeFile(change.path, change.content ?? '', 'utf-8');
               if (change.mode !== undefined) {
                  // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
                  await chmod(change.path, change.mode);
               }
            }
         }
      } catch (error) {
         // Rollback on failure - must be sequential to restore in reverse order
         for (const { path, originalContent } of applied) {
            try {
               if (originalContent === null) {
                  // eslint-disable-next-line no-await-in-loop -- Sequential rollback
                  await rm(path, { force: true });
               } else {
                  // eslint-disable-next-line no-await-in-loop -- Sequential rollback
                  await writeFile(path, originalContent, 'utf-8');
               }
            } catch {
               // Best effort rollback
            }
         }
         throw error;
      }
   }

   /**
    * Read existing file content, returning null if file doesn't exist.
    */
   protected async readExisting(filePath: string): Promise<string | null> {
      try {
         return await readFile(filePath, 'utf-8');
      } catch {
         return null;
      }
   }

   /**
    * Determine if a file needs to be created, updated, or is unchanged.
    */
   protected determineAction(
      existingContent: string | null,
      newContent: string,
   ): 'create' | 'update' | 'unchanged' {
      if (existingContent === null) {
         return 'create';
      }
      if (existingContent === newContent) {
         return 'unchanged';
      }
      return 'update';
   }

   /**
    * Load and merge rules from config and skills. Uses the skills strategy to install skills and
    * generate any necessary pointer rules.
    */
   protected async loadRules(
      config: AiJsonConfig,
      projectRoot: string,
      options: { dryRun?: boolean; scopes?: string[] } = {},
   ): Promise<{ rules: EditorRule[]; skillChanges: FileChange[] }> {
      const basePath = join(projectRoot, 'ai.json'),
            scopes = options.scopes ?? ['rules', 'mcp', 'skills', 'editors'];
      let skillChanges: FileChange[] = [],
          skillRules: EditorRule[] = [];

      // Resolve skills and use the skills strategy to install them (only if skills scope is included)
      if (scopes.includes('skills') && config.skills && Object.keys(config.skills).length > 0) {
         const resolvedSkills = await resolveAllSkills(config.skills, {
            baseDir: projectRoot,
            projectRoot,
         });

         // Install skills using the strategy (handles copying and symlinks/pointer rules)
         skillChanges = await this.skillsStrategy.installSkills(resolvedSkills, projectRoot, options);

         // Generate skill rules (empty for native, pointer rules for non-native)
         skillRules = this.skillsStrategy.generateSkillRules(resolvedSkills);
      }

      // Merge config rules with skill rules
      const merged = await mergeRules(config.rules ?? {}, [], { basePath });

      const configRules = merged.all.map((rule: MergedRule) => ({
         name: rule.name,
         content: rule.content,
         activation: {
            type: rule.metadata.activation,
            description: rule.metadata.description,
            globs: rule.metadata.globs,
         },
         sourcePath: rule.sourcePath,
      }));

      // Combine config rules with skill rules
      const rules = [...configRules, ...skillRules];

      return { rules, skillChanges };
   }

   /**
    * Plan file changes using the rules and MCP strategies. This is the default implementation that
    * most adapters can use directly.
    */
   protected async planChanges(
      editorConfig: EditorConfig,
      projectRoot: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [],
            configDir = join(projectRoot, this.configDir);

      // Rules (markdown files - always overwrite, no merge)
      if (scopes.includes('rules')) {
         const rulesDir = join(configDir, this.rulesStrategy.getRulesDir()),
               ext = this.rulesStrategy.getFileExtension();

         const ruleChanges = await Promise.all(
            editorConfig.rules.map(async (rule) => {
               const fileName = this.sanitizeFileName(this.deriveRuleName(rule)) + ext,
                     filePath = join(rulesDir, fileName),
                     content = this.rulesStrategy.formatRule(rule),
                     existing = await this.readExisting(filePath),
                     action = this.determineAction(existing, content);

               return { path: filePath, action, content, category: 'rule' as const };
            }),
         );

         changes.push(...ruleChanges);
      }

      // MCP config (JSON file - merge by default unless overwrite is set)
      // Skip for global-only strategies (e.g., Windsurf) - they're handled separately
      if (scopes.includes('mcp') && this.mcpStrategy.isSupported() && !this.mcpStrategy.isGlobalOnly?.()) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const mcpPath = join(configDir, this.mcpStrategy.getConfigPath());

            // Only merge JSON files that we directly write to (MCP config files)
            if (this.isJsonFile(mcpPath)) {
               const change = await this.planJsonFileChange(
                  mcpPath,
                  this.mcpStrategy.formatConfig(editorConfig.mcp),
                  options,
               );

               changes.push({ ...change, category: 'mcp' });
            } else {
               // Non-JSON MCP config (e.g., codex flags) - always overwrite
               const content = this.mcpStrategy.formatConfig(editorConfig.mcp),
                     existing = await this.readExisting(mcpPath),
                     action = this.determineAction(existing, content);

               changes.push({ path: mcpPath, action, content, category: 'mcp' });
            }
         }
      }

      // Prompts/commands (markdown files - always overwrite, no merge)
      if (scopes.includes('editors') && this.promptsStrategy.isSupported()) {
         const promptsDir = join(configDir, this.promptsStrategy.getPromptsDir()),
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

      // Hooks (JSON file - merge by default unless overwrite is set)
      if (scopes.includes('editors') && this.hooksStrategy.isSupported() && editorConfig.hooks) {
         const hookEvents = Object.keys(editorConfig.hooks);

         if (hookEvents.length > 0) {
            const formattedHooks = this.hooksStrategy.formatConfig(editorConfig.hooks);

            // Only write hooks file if formatConfig produced actual hooks (not just empty wrapper)
            const parsedHooks = JSON.parse(formattedHooks) as { hooks?: Record<string, unknown> };

            if (parsedHooks.hooks && Object.keys(parsedHooks.hooks).length > 0) {
               const hooksPath = join(configDir, this.hooksStrategy.getConfigPath()),
                     change = await this.planJsonFileChange(hooksPath, formattedHooks, options);

               changes.push({ ...change, category: 'hook' });
            }
         }
      }

      return changes;
   }

   /**
    * Check if a file path is a JSON file based on extension.
    */
   protected isJsonFile(filePath: string): boolean {
      return filePath.endsWith('.json');
   }

   /**
    * Plan a change for a JSON file, merging with existing content unless overwrite is set.
    */
   protected async planJsonFileChange(
      filePath: string,
      newContent: string,
      options: ApplyOptions = {},
   ): Promise<FileChange> {
      const existing = await this.readExisting(filePath);

      // If overwrite mode or file doesn't exist, use new content directly
      if (options.overwrite || existing === null) {
         const action = this.determineAction(existing, newContent);

         return { path: filePath, action, content: newContent };
      }

      // Merge existing JSON with new JSON
      try {
         const existingJson = JSON.parse(existing) as Record<string, unknown>,
               newJson = JSON.parse(newContent) as Record<string, unknown>,
               merged = deepMergeJson(existingJson, newJson, { resolver: mcpConfigMergeResolver }),
               mergedContent = JSON.stringify(merged, null, 2) + '\n',
               action = this.determineAction(existing, mergedContent);

         return { path: filePath, action, content: mergedContent };
      } catch {
         // If JSON parsing fails, fall back to overwrite
         const action = this.determineAction(existing, newContent);

         return { path: filePath, action, content: newContent };
      }
   }

   /**
    * Sanitize a string for use as a filename.
    */
   protected sanitizeFileName(name: string): string {
      return name
         .toLowerCase()
         .replace(/[^a-z0-9-]/g, '-')
         .replace(/-+/g, '-')
         .replace(/^-|-$/g, '');
   }

   /**
    * Extract filename from a source path (git or local).
    * Git format: "url#ref:path/to/file.md" -> "file.md"
    * Local format: "/path/to/file.md" -> "file.md"
    */
   private extractFileNameFromPath(sourcePath: string): string | undefined {
      // Git source format: "url#ref:path/to/file.md"
      const hashIdx = sourcePath.indexOf('#');

      if (hashIdx !== -1) {
         const afterHash = sourcePath.slice(hashIdx + 1);
         const colonIdx = afterHash.indexOf(':');

         if (colonIdx !== -1) {
            const filePath = afterHash.slice(colonIdx + 1);

            if (filePath) {
               // Git paths always use forward slashes
               return filePath.split('/').pop();
            }
         }
      }
      // Local file path - use basename for cross-platform support
      return basename(sourcePath);
   }

   /**
    * Derive a rule name from the rule's name field or sourcePath.
    * For git sources, extracts the filename from the path.
    * For local files, extracts the filename from the path.
    */
   protected deriveRuleName(rule: EditorRule): string {
      if (rule.name) {
         return rule.name;
      }

      if (rule.sourcePath) {
         const fileName = this.extractFileNameFromPath(rule.sourcePath);

         if (fileName) {
            return fileName.replace(/\.(md|mdc|txt)$/i, '');
         }
      }

      return 'rule';
   }

   /**
    * Derive a prompt name from the prompt's name field or sourcePath.
    */
   protected derivePromptName(prompt: EditorPrompt): string {
      if (prompt.name) {
         return prompt.name;
      }

      if (prompt.sourcePath) {
         const fileName = this.extractFileNameFromPath(prompt.sourcePath);

         if (fileName) {
            return fileName.replace(/\.(md|prompt\.md|txt)$/i, '');
         }
      }

      return 'prompt';
   }

   /**
    * Load prompts from config. Resolves content from inline, path, or git sources.
    */
   protected async loadPrompts(config: AiJsonConfig, projectRoot: string): Promise<EditorPrompt[]> {
      if (!config.prompts || Object.keys(config.prompts).length === 0) {
         return [];
      }

      const basePath = join(projectRoot, 'ai.json');
      const loaded = await loadPromptsFromConfig(config.prompts, basePath);

      return Object.values(loaded).map((p: LoadedPrompt) => ({
         name: p.name,
         content: p.content,
         description: p.description,
         argumentHint: p.argumentHint,
         sourcePath: p.sourcePath,
      }));
   }

   /**
    * Get features from the config that this editor doesn't support. Uses the strategy isSupported()
    * methods to determine what's available.
    */
   getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures {
      const unsupported: UnsupportedFeatures = {},
            mcpServers = Object.keys(config.mcp ?? {});

      // Check MCP support
      if (mcpServers.length > 0 && !this.mcpStrategy.isSupported()) {
         unsupported.mcp = {
            reason: `${this.name} does not support MCP servers`,
            servers: mcpServers,
         };
      }

      // Check hooks support
      if (config.hooks && Object.keys(config.hooks).length > 0) {
         if (!this.hooksStrategy.isSupported()) {
            unsupported.hooks = {
               reason: `${this.name} does not support hooks`,
               allUnsupported: true,
            };
         } else {
            const unsupportedEvents = this.hooksStrategy.getUnsupportedEvents(config.hooks);

            if (unsupportedEvents.length > 0) {
               unsupported.hooks = {
                  reason: `${this.name} does not support some hook events`,
                  unsupportedEvents,
               };
            }
         }
      }

      // Check prompts support
      const promptNames = Object.keys(config.prompts ?? {});

      if (promptNames.length > 0 && !this.promptsStrategy.isSupported()) {
         unsupported.prompts = {
            reason: `${this.name} does not support prompts/commands`,
            prompts: promptNames,
         };
      }

      return unsupported;
   }
}
