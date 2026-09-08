import { join, dirname, basename } from 'pathe';
import { isRecord } from '../../type-guards.js';
import type { AiJsonConfig, HooksConfig, McpServerConfig, ParsedSkill } from '@a1st/aix-schema';
import { parseJsonc } from '@a1st/aix-schema';
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
   TargetScopeLimitations,
} from '../types.js';
import type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
   PluginsStrategy,
   MarketplacesStrategy,
   EditorStrategyBundle,
} from '../strategies/types.js';
import { deepMergeJson, mcpConfigMergeResolver } from '../../json.js';
import { loadPrompts as loadPromptsFromConfig, type LoadedPrompt } from '../../prompts/loader.js';
import { loadAgents as loadAgentsFromConfig, type LoadedAgent } from '../../agents/loader.js';
import { mergeRules, type MergedRule } from '../../rules/merger.js';
import { resolveAllSkills } from '../../skills/resolve.js';
import { getRuntimeAdapter } from '../../runtime/index.js';
import {
   hasHooksConfigPath,
   resolveHooksConfigPath,
   resolvePluginsConfigPath,
   resolveMarketplacesConfigPath,
   hasPluginsConfigPath,
   hasMarketplacesConfigPath,
   unpackAllPlugins,
} from '../strategies/shared/index.js';
import { upsertManagedSection } from '../section-managed-markdown.js';

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


function looksLikeFlatMcpServer(value: unknown): value is Record<string, unknown> {
   return (
      isRecord(value) &&
      (
         typeof value.command === 'string' ||
         typeof value.url === 'string' ||
         (
            (value.type === 'local' || value.type === 'stdio' || value.type === 'http') &&
            (typeof value.command === 'string' || typeof value.url === 'string')
         )
      )
   );
}

function normalizeFlatMcpConfigForMerge(config: Record<string, unknown>): Record<string, unknown> {
   if (config.mcpServers || config.servers || config.context_servers || config.mcp_servers || config.mcp) {
      return config;
   }

   const mcpServers: Record<string, unknown> = {},
         otherEntries: Record<string, unknown> = {};

   for (const [key, value] of Object.entries(config)) {
      if (looksLikeFlatMcpServer(value)) {
         mcpServers[key] = value;
      } else {
         otherEntries[key] = value;
      }
   }

   if (Object.keys(mcpServers).length === 0) {
      return config;
   }

   return {
      ...otherEntries,
      mcpServers,
   };
}

/**
 * Base class for editor adapters providing common functionality for detecting editor config
 * directories, writing files atomically, and managing backups. Subclasses provide strategies for
 * rules, MCP, and skills handling.
 */
export abstract class BaseEditorAdapter implements EditorAdapter {
   abstract readonly name: EditorName;
   abstract readonly configDir: string;

   /**
    * Get the global data/config paths for this editor by platform. Used to detect if the editor is
    * installed globally on the system. Paths are relative to the user's home directory.
    */
   abstract getGlobalDataPaths(): Partial<Record<NodeJS.Platform, string[]>>;

   /** Strategy for formatting and writing rules */
   protected abstract readonly rulesStrategy: RulesStrategy;

   /** Strategy for formatting and writing MCP config */
   protected abstract readonly mcpStrategy: McpStrategy;

   /** Strategy for installing skills (native or pointer) */
   protected abstract readonly skillsStrategy: SkillsStrategy;

   /** Strategy for formatting and writing prompts/commands */
   protected abstract readonly promptsStrategy: PromptsStrategy;

   /** Strategy for formatting and writing agents */
   protected abstract readonly agentsStrategy: AgentsStrategy;

   /** Strategy for formatting and writing hooks */
   protected abstract readonly hooksStrategy: HooksStrategy;

   /** Strategy for configuring plugins */
   protected abstract readonly pluginsStrategy: PluginsStrategy;

   /** Strategy for configuring plugin marketplace catalogs */
   protected abstract readonly marketplacesStrategy: MarketplacesStrategy;

   getStrategyBundle(): EditorStrategyBundle {
      return {
         configDir: this.configDir,
         mcpStrategy: this.mcpStrategy,
         rulesStrategy: this.rulesStrategy,
         skillsStrategy: this.skillsStrategy,
         promptsStrategy: this.promptsStrategy,
         agentsStrategy: this.agentsStrategy,
         hooksStrategy: this.hooksStrategy,
         pluginsStrategy: this.pluginsStrategy,
         marketplacesStrategy: this.marketplacesStrategy,
      };
   }

   async detect(projectRoot: string): Promise<boolean> {
      const configPath = join(projectRoot, this.configDir);

      try {
         await getRuntimeAdapter().fs.access(configPath, getRuntimeAdapter().fs.constants.F_OK);
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

      const scopes = options.scopes ?? ['rules', 'mcp', 'skills', 'agents', 'hooks', 'plugins', 'marketplaces', 'editors'];

      try {
         // Clean the .aix folder if requested (ensures exact match with ai.json)
         if (options.clean && !options.dryRun) {
            await this.cleanAixFolder(projectRoot, options.targetScope);
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
   protected async cleanAixFolder(
      projectRoot: string,
      targetScope: 'project' | 'user' = 'project',
   ): Promise<void> {
      const aixPath = join(targetScope === 'user' ? getRuntimeAdapter().os.homedir() : projectRoot, '.aix');

      if (!getRuntimeAdapter().fs.existsSync(aixPath)) {
         return;
      }

      // Remove the .aix folder entirely, then recreate .tmp if needed
      await getRuntimeAdapter().fs.rm(aixPath, { recursive: true, force: true });
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

            if (getRuntimeAdapter().fs.existsSync(change.path)) {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               originalContent = await getRuntimeAdapter().fs.readFile(change.path, 'utf-8');
            }
            applied.push({ path: change.path, originalContent });

            if (change.action === 'delete') {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await getRuntimeAdapter().fs.rm(change.path, { force: true });
            } else {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await getRuntimeAdapter().fs.mkdir(dirname(change.path), { recursive: true });
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await getRuntimeAdapter().fs.writeFile(change.path, change.content ?? '', 'utf-8');
               if (change.mode !== undefined) {
                  // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
                  await getRuntimeAdapter().fs.chmod(change.path, change.mode);
               }
            }
         }
      } catch (error) {
         // Rollback on failure - must be sequential to restore in reverse order
         for (const { path, originalContent } of applied) {
            try {
               if (originalContent === null) {
                  // eslint-disable-next-line no-await-in-loop -- Sequential rollback
                  await getRuntimeAdapter().fs.rm(path, { force: true });
               } else {
                  // eslint-disable-next-line no-await-in-loop -- Sequential rollback
                  await getRuntimeAdapter().fs.writeFile(path, originalContent, 'utf-8');
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
         return await getRuntimeAdapter().fs.readFile(filePath, 'utf-8');
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
      options: {
         dryRun?: boolean;
         scopes?: string[];
         configBaseDir?: string;
         targetScope?: 'project' | 'user';
      } = {},
   ): Promise<{
      rules: EditorRule[];
      skillRules: EditorRule[];
      skillChanges: FileChange[];
      skills: Map<string, ParsedSkill>;
   }> {
      // Use configBaseDir for resolving relative paths (important for remote configs)
      const configBaseDir = options.configBaseDir ?? projectRoot,
            basePath = join(configBaseDir, 'ai.json'),
            scopes = options.scopes ?? ['rules', 'mcp', 'skills', 'agents', 'editors'];
      let skillChanges: FileChange[] = [],
          skillRules: EditorRule[] = [],
          resolvedSkills = new Map<string, ParsedSkill>();

      // Resolve skills and use the skills strategy to install them (only if skills scope is included)
      if (scopes.includes('skills') && config.skills && Object.keys(config.skills).length > 0) {
         resolvedSkills = await resolveAllSkills(config.skills, {
            baseDir: configBaseDir,
            projectRoot,
         });

         skillChanges = await this.skillsStrategy.installSkills(
            resolvedSkills,
            projectRoot,
            options,
         );
         skillRules = this.skillsStrategy.generateSkillRules(resolvedSkills, {
            targetScope: options.targetScope,
         });
      }

      // Merge config rules only when rule scope is requested. Skill pointer rules are handled above.
      const merged = scopes.includes('rules')
         ? await mergeRules(config.rules ?? {}, [], { basePath })
         : { all: [] };

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

      return { rules, skillRules, skillChanges, skills: resolvedSkills };
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
            configDir = join(projectRoot, this.configDir),
            targetScope = options.targetScope ?? 'project';

      // Rules (markdown files - always overwrite, no merge)
      if (scopes.includes('rules') && editorConfig.rules.length > 0) {
         const globalRulesPath = this.rulesStrategy.getGlobalRulesPath();

         if (targetScope === 'user' && globalRulesPath) {
            const filePath = join(getRuntimeAdapter().os.homedir(), globalRulesPath),
                  managedContent = editorConfig.rules
                     .map((rule) => this.rulesStrategy.formatGlobalRule?.(rule) ?? this.rulesStrategy.formatRule(rule))
                     .join('\n\n'),
                  existing = await this.readExisting(filePath),
                  content = upsertManagedSection(existing, managedContent),
                  action = this.determineAction(existing, content);

            changes.push({ path: filePath, action, content, category: 'rule' });
         } else if (targetScope === 'project') {
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
      }

      // MCP config (JSON file - merge by default unless overwrite is set)
      // Skip for global-only strategies (e.g., Windsurf) - they're handled separately
      if (
         scopes.includes('mcp') &&
         this.mcpStrategy.isSupported() &&
         !this.mcpStrategy.isGlobalOnly?.()
      ) {
         const mcpEntries = Object.keys(editorConfig.mcp);

         if (mcpEntries.length > 0) {
            const globalMcpPath = this.mcpStrategy.getGlobalMcpConfigPath(),
                  mcpPath =
                     targetScope === 'user' && globalMcpPath
                        ? join(getRuntimeAdapter().os.homedir(), globalMcpPath)
                        : join(
                           this.mcpStrategy.isProjectRootConfig?.() ? projectRoot : configDir,
                           this.mcpStrategy.getConfigPath(),
                        );

            // Only merge JSON files that we directly write to (MCP config files)
            if (this.isJsonFile(mcpPath)) {
               const change = await this.planJsonFileChange(
                  mcpPath,
                  this.mcpStrategy.formatConfig(editorConfig.mcp),
                  options,
               );

               changes.push({ ...change, category: 'mcp', items: mcpEntries });
            } else {
               // Non-JSON MCP config (e.g., codex flags) - always overwrite
               const content = this.mcpStrategy.formatConfig(editorConfig.mcp),
                     existing = await this.readExisting(mcpPath),
                     action = this.determineAction(existing, content);

               changes.push({ path: mcpPath, action, content, category: 'mcp', items: mcpEntries });
            }
         }
      }

      // Prompts/commands (markdown files - always overwrite, no merge)
      if (
         (scopes.includes('editors') || scopes.includes('prompts')) &&
         this.promptsStrategy.isSupported() &&
         !this.promptsStrategy.isGlobalOnly?.()
      ) {
         const globalPromptsPath = this.promptsStrategy.getGlobalPromptsPath(),
               promptsDir =
                  targetScope === 'user' && globalPromptsPath
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

      changes.push(...await this.planHookChanges(editorConfig, configDir, scopes, options));

      // Agents (markdown files - always overwrite, no merge)
      if (
         (scopes.includes('editors') || scopes.includes('agents')) &&
         this.agentsStrategy.isSupported() &&
         editorConfig.agents &&
         editorConfig.agents.length > 0
      ) {
         const globalAgentsPath = this.agentsStrategy.getGlobalAgentsPath(),
               agentsDir =
                  targetScope === 'user' && globalAgentsPath
                     ? join(getRuntimeAdapter().os.homedir(), globalAgentsPath)
                     : join(configDir, this.agentsStrategy.getAgentsDir()),
               ext = this.agentsStrategy.getFileExtension();

         const agentChanges = await Promise.all(
            editorConfig.agents.map(async (agent) => {
               const fileName = this.sanitizeFileName(this.deriveAgentName(agent)) + ext,
                     filePath = join(agentsDir, fileName),
                     content = this.agentsStrategy.formatAgent(agent),
                     existing = await this.readExisting(filePath),
                     action = this.determineAction(existing, content);

               return { path: filePath, action, content, category: 'workflow' as const };
            }),
         );

         changes.push(...agentChanges);
      }

      changes.push(...await this.planPluginChanges({
         editorConfig,
         configDir,
         projectRoot,
         scopes,
         options,
         existingChanges: changes,
      }));
      changes.push(...await this.planMarketplaceChanges({
         editorConfig,
         configDir,
         projectRoot,
         scopes,
         options,
         existingChanges: changes,
      }));

      return changes;
   }

   protected async planHookChanges(
      editorConfig: EditorConfig,
      configDir: string,
      scopes: string[],
      options: ApplyOptions = {},
   ): Promise<FileChange[]> {
      const changes: FileChange[] = [];

      if (
         !(scopes.includes('editors') || scopes.includes('hooks')) ||
         !this.hooksStrategy.isSupported() ||
         !editorConfig.hooks
      ) {
         return changes;
      }

      const hookEvents = Object.keys(editorConfig.hooks);

      if (hookEvents.length === 0) {
         return changes;
      }

      const hooksPath = resolveHooksConfigPath(
         this.hooksStrategy,
         configDir,
         options.targetScope ?? 'project',
      );

      // No path for the requested scope means this editor cannot hold hooks there. The skip
      // is reported through getTargetScopeLimitations rather than written somewhere else.
      if (!hooksPath) {
         return changes;
      }

      const formattedHooks = this.hooksStrategy.formatConfig(editorConfig.hooks),
            parsedHooks = JSON.parse(formattedHooks) as { hooks?: Record<string, unknown> };

      if (!parsedHooks.hooks || Object.keys(parsedHooks.hooks).length === 0) {
         return changes;
      }

      const change = await this.planJsonFileChange(hooksPath, formattedHooks, options);

      changes.push({ ...change, category: 'hook' });

      return changes;
   }

   protected async planPluginChanges(params: {
      editorConfig: EditorConfig;
      configDir: string;
      projectRoot: string;
      scopes: string[];
      options?: ApplyOptions;
      existingChanges?: FileChange[];
   }): Promise<FileChange[]> {
      const {
         editorConfig,
         configDir,
         projectRoot,
         scopes,
         options = {},
         existingChanges = [],
      } = params;
      const changes: FileChange[] = [];

      if (
         !(scopes.includes('editors') || scopes.includes('plugins')) ||
         !this.pluginsStrategy.isSupported() ||
         !editorConfig.plugins
      ) {
         return changes;
      }

      const pluginNames = Object.keys(editorConfig.plugins);

      if (pluginNames.length === 0) {
         return changes;
      }

      const pluginsPath = resolvePluginsConfigPath(
         this.pluginsStrategy,
         configDir,
         options.targetScope ?? 'project',
         projectRoot,
      );

      if (!pluginsPath) {
         return changes;
      }

      const formatted = this.pluginsStrategy.formatConfig(editorConfig.plugins, options.targetScope),
            existingInChanges = existingChanges.find((c) => c.path === pluginsPath),
            baseContent = existingInChanges ? existingInChanges.content : undefined;

      const change = await this.planJsonFileChange(pluginsPath, formatted, options, baseContent);

      if (existingInChanges) {
         existingInChanges.content = change.content;
         existingInChanges.action = change.action;
         if (existingInChanges.items) {
            existingInChanges.items.push(...pluginNames);
         }
      } else {
         changes.push({ ...change, category: 'plugin', items: pluginNames });
      }

      return changes;
   }

   protected async planMarketplaceChanges(params: {
      editorConfig: EditorConfig;
      configDir: string;
      projectRoot: string;
      scopes: string[];
      options?: ApplyOptions;
      existingChanges?: FileChange[];
   }): Promise<FileChange[]> {
      const {
         editorConfig,
         configDir,
         projectRoot,
         scopes,
         options = {},
         existingChanges = [],
      } = params;
      const changes: FileChange[] = [];

      if (
         !(scopes.includes('editors') || scopes.includes('marketplaces')) ||
         !this.marketplacesStrategy.isSupported() ||
         !editorConfig.marketplaces
      ) {
         return changes;
      }

      const marketplaceNames = Object.keys(editorConfig.marketplaces);

      if (marketplaceNames.length === 0) {
         return changes;
      }

      const marketplacesPath = resolveMarketplacesConfigPath(
         this.marketplacesStrategy,
         configDir,
         options.targetScope ?? 'project',
         projectRoot,
      );

      if (!marketplacesPath) {
         return changes;
      }

      const formatted = this.marketplacesStrategy.formatConfig(editorConfig.marketplaces, options.targetScope),
            existingInChanges = existingChanges.find((c) => c.path === marketplacesPath),
            baseContent = existingInChanges ? existingInChanges.content : undefined;

      const change = await this.planJsonFileChange(marketplacesPath, formatted, options, baseContent);

      if (existingInChanges) {
         existingInChanges.content = change.content;
         existingInChanges.action = change.action;
         if (existingInChanges.items) {
            existingInChanges.items.push(...marketplaceNames);
         }
      } else {
         changes.push({ ...change, category: 'marketplace', items: marketplaceNames });
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
      baseContent?: string | null,
   ): Promise<FileChange> {
      const existing = baseContent !== undefined ? baseContent : await this.readExisting(filePath);

      // If overwrite mode or file doesn't exist, use new content directly
      if (options.overwrite || existing === null) {
         const action = this.determineAction(existing, newContent);

         return { path: filePath, action, content: newContent };
      }

      // Merge existing JSON with new JSON. Use parseJsonc so files with comments or
      // trailing commas (e.g., Zed's settings.json) are parsed correctly instead of
      // triggering the fallback overwrite path.
      const existingParseResult = parseJsonc<Record<string, unknown>>(existing);

      if (existingParseResult.errors.length > 0 || !isRecord(existingParseResult.data)) {
         const action = this.determineAction(existing, newContent);

         return { path: filePath, action, content: newContent };
      }

      try {
         const existingJson = normalizeFlatMcpConfigForMerge(existingParseResult.data),
               newJson = JSON.parse(newContent) as Record<string, unknown>,
               merged = deepMergeJson(existingJson, newJson, { resolver: mcpConfigMergeResolver }),
               mergedContent = JSON.stringify(merged, null, 2) + '\n',
               action = this.determineAction(existing, mergedContent);

         return { path: filePath, action, content: mergedContent };
      } catch {
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
    * Derive an agent name from the agent's name field or sourcePath.
    */
   protected deriveAgentName(agent: import('../types.js').EditorAgent): string {
      if (agent.name) {
         return agent.name;
      }

      if (agent.sourcePath) {
         const fileName = this.extractFileNameFromPath(agent.sourcePath);

         if (fileName) {
            return fileName.replace(/\.(agent\.md|md|txt)$/i, '');
         }
      }

      return 'agent';
   }

   /**
    * Load prompts from config. Resolves content from inline, path, or git sources.
    */
   protected async loadPrompts(
      config: AiJsonConfig,
      projectRoot: string,
      options: { configBaseDir?: string } = {},
   ): Promise<EditorPrompt[]> {
      if (!config.prompts || Object.keys(config.prompts).length === 0) {
         return [];
      }

      // Use configBaseDir for resolving relative paths (important for remote configs)
      const configBaseDir = options.configBaseDir ?? projectRoot,
            basePath = join(configBaseDir, 'ai.json');
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
    * Load agents from config. Resolves content from inline, path, git, or npm sources.
    */
   protected async loadAgents(
      config: AiJsonConfig,
      projectRoot: string,
      options: { configBaseDir?: string } = {},
   ): Promise<import('../types.js').EditorAgent[]> {
      if (!config.agents || Object.keys(config.agents).length === 0) {
         return [];
      }

      const configBaseDir = options.configBaseDir ?? projectRoot,
            basePath = join(configBaseDir, 'ai.json'),
            loaded = await loadAgentsFromConfig(config.agents, basePath);

      return Object.values(loaded).map((agent: LoadedAgent) => ({
         name: agent.name,
         content: agent.content,
         description: agent.description,
         mode: agent.mode,
         model: agent.model,
         tools: agent.tools,
         permissions: agent.permissions,
         mcp: agent.mcp,
         editor: agent.editor,
         sourcePath: agent.sourcePath,
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
         unsupported.hooks = this.getUnsupportedHooks(config.hooks);

         if (!unsupported.hooks) {
            delete unsupported.hooks;
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

      // Check agents support
      const agentNames = Object.keys(config.agents ?? {});

      if (agentNames.length > 0 && !this.agentsStrategy.isSupported()) {
         unsupported.agents = {
            reason: `${this.name} does not support custom agents`,
            agents: agentNames,
         };
      }

      // Check plugins support
      const pluginNames = Object.keys(config.plugins ?? {});

      if (pluginNames.length > 0 && !this.pluginsStrategy.isSupported()) {
         unsupported.plugins = {
            reason: `${this.name} does not support plugins`,
            plugins: pluginNames,
         };
      }

      // Check marketplaces support
      const marketplaceNames = Object.keys(config.marketplaces ?? {});

      if (marketplaceNames.length > 0 && !this.marketplacesStrategy.isSupported()) {
         unsupported.marketplaces = {
            reason: `${this.name} does not support marketplaces`,
            marketplaces: marketplaceNames,
         };
      }

      return unsupported;
   }

   /**
    * Describe what this editor cannot express from the configured hooks: the whole feature,
    * individual events, or individual action fields. Returns undefined when everything is
    * representable.
    */
   protected getUnsupportedHooks(hooks: HooksConfig): UnsupportedFeatures['hooks'] {
      if (!this.hooksStrategy.isSupported()) {
         return {
            reason: `${this.name} does not support hooks`,
            allUnsupported: true,
         };
      }

      const unsupportedEvents = this.hooksStrategy.getUnsupportedEvents(hooks),
            unsupportedFields = this.hooksStrategy.getUnsupportedFields(hooks);

      if (unsupportedEvents.length === 0 && unsupportedFields.length === 0) {
         return undefined;
      }

      const reasons: string[] = [];

      if (unsupportedEvents.length > 0) {
         reasons.push('some hook events');
      }
      if (unsupportedFields.length > 0) {
         reasons.push('some hook action fields');
      }

      return {
         reason: `${this.name} does not support ${reasons.join(' or ')}`,
         ...(unsupportedEvents.length > 0 ? { unsupportedEvents } : {}),
         ...(unsupportedFields.length > 0 ? { unsupportedFields } : {}),
      };
   }

   /**
    * If this adapter uses a compatibility unpacker strategy for plugins, unpack local plugin
    * skills, MCP servers, and rules and merge them into the config for project-scope installs.
    */
   protected async unpackCompatibilityPlugins(
      config: AiJsonConfig,
      projectRoot: string,
      options: ApplyOptions = {},
   ): Promise<AiJsonConfig> {
      const targetScope = options.targetScope ?? 'project';

      if (
         targetScope !== 'project' ||
         !this.pluginsStrategy.isSupported() ||
         !this.pluginsStrategy.isCompatibility?.() ||
         !config.plugins ||
         Object.keys(config.plugins).length === 0
      ) {
         return config;
      }

      const unpacked = await unpackAllPlugins(config.plugins, projectRoot),
            hasUnpackedSkills = Object.keys(unpacked.skills).length > 0,
            hasUnpackedMcp = Object.keys(unpacked.mcp).length > 0,
            hasUnpackedRules = Object.keys(unpacked.rules).length > 0;

      if (!hasUnpackedSkills && !hasUnpackedMcp && !hasUnpackedRules) {
         return config;
      }

      return {
         ...config,
         skills: hasUnpackedSkills ? { ...unpacked.skills, ...config.skills } : config.skills,
         mcp: hasUnpackedMcp ? { ...unpacked.mcp, ...config.mcp } : config.mcp,
         rules: hasUnpackedRules ? { ...unpacked.rules, ...config.rules } : config.rules,
      };
   }

   getTargetScopeLimitations(
      config: AiJsonConfig,
      targetScope: 'project' | 'user',
   ): TargetScopeLimitations {
      const limitations: TargetScopeLimitations = {},
            ruleNames = Object.entries(config.rules ?? {})
               .filter(([, value]) => value !== false)
               .map(([name]) => name),
            skillNames = Object.entries(config.skills ?? {})
               .filter(([, value]) => value !== false)
               .map(([name]) => name),
            hookEvents = Object.keys(config.hooks ?? {}),
            pluginNames = Object.entries(config.plugins ?? {})
               .filter(([, value]) => value !== false)
               .map(([name]) => name),
            marketplaceNames = Object.entries(config.marketplaces ?? {})
               .filter(([, value]) => value !== false)
               .map(([name]) => name);

      if (
         hookEvents.length > 0 &&
         this.hooksStrategy.isSupported() &&
         !hasHooksConfigPath(this.hooksStrategy, targetScope)
      ) {
         limitations.hooks = {
            reason: `${this.name} has no ${targetScope}-scope hooks config file`,
            events: hookEvents,
         };
      }

      if (
         pluginNames.length > 0 &&
         this.pluginsStrategy.isSupported() &&
         !hasPluginsConfigPath(this.pluginsStrategy, targetScope)
      ) {
         limitations.plugins = {
            reason: `${this.name} has no ${targetScope}-scope plugins config file`,
            plugins: pluginNames,
         };
      }

      if (
         marketplaceNames.length > 0 &&
         this.marketplacesStrategy.isSupported() &&
         !hasMarketplacesConfigPath(this.marketplacesStrategy, targetScope)
      ) {
         limitations.marketplaces = {
            reason: `${this.name} has no ${targetScope}-scope marketplaces config file`,
            marketplaces: marketplaceNames,
         };
      }

      if (targetScope !== 'user') {
         return limitations;
      }

      if (ruleNames.length > 0 && !this.rulesStrategy.getGlobalRulesPath()) {
         limitations.rules = {
            reason: `${this.name} does not have a user-scope rules file path`,
            rules: ruleNames,
         };
      }

      if (skillNames.length > 0 && !this.skillsStrategy.isNative() && !this.rulesStrategy.getGlobalRulesPath()) {
         limitations.skills = {
            reason: `${this.name} cannot activate pointer skills at user scope without a writable user-scope rules file`,
            skills: skillNames,
         };
      }

      return limitations;
   }
}
