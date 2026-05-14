import { join } from 'pathe';
import {
   createEmptyConfig,
   type AiJsonConfig,
   type HooksConfig,
   type McpServerConfig,
} from '@a1st/aix-schema';
import type { EditorName } from './types.js';
import type {
   EditorImportScope,
   ImportedSkillsResult,
   McpStrategy,
   PromptsStrategy,
   AgentsStrategy,
   RulesStrategy,
   SkillsStrategy,
   HooksStrategy,
} from './strategies/types.js';
import type { NamedRule } from '../import-writer.js';
import { getAdapter } from './install.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { getRuntimeAdapter, type RuntimeDirent } from '../runtime/index.js';

type ImportScope = EditorImportScope;
export type ImportReadScope = ImportScope | 'all';

function existsSync(path: string): boolean {
   return getRuntimeAdapter().fs.existsSync(path);
}

function homedir(): string {
   return getRuntimeAdapter().os.homedir();
}

function assertGlobalHomeAccess(action: string): void {
   if (!getRuntimeAdapter().host.supportsGlobalHomeAccess()) {
      throw new UnsupportedRuntimeCapabilityError('global-home-access', action);
   }
}

function readFile(path: string, encoding: 'utf-8'): Promise<string> {
   return getRuntimeAdapter().fs.readFile(path, encoding);
}

function readdir(path: string): Promise<string[]>;
function readdir(path: string, options: { withFileTypes: true }): Promise<RuntimeDirent[]>;
function readdir(path: string, options?: { withFileTypes: true }): Promise<string[] | RuntimeDirent[]> {
   if (options) {
      return getRuntimeAdapter().fs.readdir(path, options);
   }
   return getRuntimeAdapter().fs.readdir(path);
}

function buildGlobalPath(relativePath: string | null): string | null {
   return relativePath ? join(homedir(), relativePath) : null;
}

function buildProjectPath(
   relativePath: string,
   projectRoot: string | undefined,
   configDir: string,
   isProjectRootConfig = false,
): string | null {
   if (!projectRoot) {
      return null;
   }

   return isProjectRootConfig ? join(projectRoot, relativePath) : join(projectRoot, configDir, relativePath);
}

export interface ImportResult {
   mcp: Record<string, McpServerConfig>;
   rules: NamedRule[];
   skills: Record<string, string>;
   prompts: Record<string, string>;
   agents: Record<string, import('./types.js').EditorAgent>;
   hooks: HooksConfig;
   paths: {
      mcp: Record<string, string>;
      rules: Record<string, string>;
      skills: Record<string, string>;
      prompts: Record<string, string>;
      agents: Record<string, string>;
      hooks: Record<string, string>;
   };
   scopes: {
      mcp: Record<string, ImportScope>;
      rules: Record<string, ImportScope>;
      skills: Record<string, ImportScope>;
      prompts: Record<string, ImportScope>;
      agents: Record<string, ImportScope>;
      hooks: Record<string, ImportScope>;
   };
   warnings: string[];
   /** Sources that were found and imported from */
   sources: {
      global: boolean;
      local: boolean;
   };
}

export interface ImportOptions {
   /** Project root directory for local editor config lookup */
   projectRoot?: string;
   /** Which source scope to read. Defaults to 'all' for backward compatibility. */
   scope?: ImportReadScope;
}

export interface NormalizedImportedRule {
   name: string;
   sourceName: string;
   rawContent: string;
   content: string;
   description?: string;
   activation?: 'always' | 'auto' | 'glob' | 'manual';
   globs?: string[];
}

export interface NormalizedImportedPrompt {
   name: string;
   sourceName: string;
   rawContent: string;
   content: string;
   description?: string;
   argumentHint?: string;
}

export interface NormalizedImportedSkill {
   name: string;
   sourceName: string;
   ref: string;
}

export interface NormalizedEditorImport {
   mcp: ImportResult['mcp'];
   rules: NormalizedImportedRule[];
   prompts: NormalizedImportedPrompt[];
   agents: import('./types.js').EditorAgent[];
   skills: NormalizedImportedSkill[];
   hooks: HooksConfig;
}

/**
 * Import configuration from an editor and convert to ai.json format.
 * Merges global config with project-local editor config: Object.assign({}, global, local)
 *
 * @param editor - The editor to import from
 * @param options - Import options including projectRoot for local config lookup
 */
export async function importFromEditor(
   editor: EditorName,
   options: ImportOptions = {},
): Promise<ImportResult> {
   const result: ImportResult = {
            mcp: {},
            rules: [],
            skills: {},
            prompts: {},
            agents: {},
            hooks: {},
            paths: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            scopes: { mcp: {}, rules: {}, skills: {}, prompts: {}, agents: {}, hooks: {} },
            warnings: [],
            sources: { global: false, local: false },
         },
         strategies = getAdapter(editor).getStrategyBundle(),
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         scope = options.scope ?? 'all';

   if (scope === 'all' || scope === 'user') {
      assertGlobalHomeAccess(`importing global ${editor} configuration`);
      mergeImportMcp(result, await importMcpConfig(strategies.mcpStrategy, strategies.configDir, 'global'));
      mergeImportRules(result, await importGlobalRules(strategies.rulesStrategy, strategies.configDir));
      mergeImportPrompts(result, await importPrompts(strategies.promptsStrategy, strategies.configDir, 'global'));
      mergeImportAgents(result, await importAgents(strategies.agentsStrategy, strategies.configDir, 'global'));
      mergeImportSkills(result, await importSkills(strategies.skillsStrategy, 'user', projectRoot));
      mergeImportHooks(result, await importHooks(strategies.hooksStrategy, strategies.configDir, 'global'));
   }

   if (scope === 'all' || scope === 'project') {
      const isHome = projectRoot === getRuntimeAdapter().os.homedir();

      // If we are importing everything ('all') and we are in the home directory,
      // skip local imports because the local config is the exact same as the global config.
      // Importing it again would incorrectly overwrite its scope to 'project'.
      if (!isHome || scope !== 'all') {
         mergeImportMcp(result, await importLocalMcpConfig(strategies.mcpStrategy, strategies.configDir, projectRoot));
         mergeImportRules(result, await importLocalRules(strategies.rulesStrategy, strategies.configDir, projectRoot));
         mergeImportPrompts(
            result,
            await importLocalPrompts(strategies.promptsStrategy, strategies.configDir, projectRoot),
         );
         mergeImportAgents(
            result,
            await importAgents(strategies.agentsStrategy, strategies.configDir, 'project', projectRoot),
         );
         mergeImportSkills(result, await importSkills(strategies.skillsStrategy, 'project', projectRoot));
         mergeImportHooks(
            result,
            await importHooks(strategies.hooksStrategy, strategies.configDir, 'project', projectRoot),
         );
      }
   }

   return result;
}

function mergeImportMcp(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importMcpConfig>>,
): void {
   if (Object.keys(imported.mcp).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.mcp, imported.mcp);
   Object.assign(result.paths.mcp, imported.paths);
   Object.assign(result.scopes.mcp, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportRules(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importGlobalRules>>,
): void {
   if (imported.rules.length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   result.rules.push(...imported.rules);
   Object.assign(result.paths.rules, imported.paths);
   Object.assign(result.scopes.rules, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportPrompts(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importPrompts>>,
): void {
   if (Object.keys(imported.prompts).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.prompts, imported.prompts);
   Object.assign(result.paths.prompts, imported.paths);
   Object.assign(result.scopes.prompts, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportAgents(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importAgents>>,
): void {
   if (Object.keys(imported.agents).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.agents, imported.agents);
   Object.assign(result.paths.agents, imported.paths);
   Object.assign(result.scopes.agents, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportSkills(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importSkills>>,
): void {
   if (Object.keys(imported.skills).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.skills, imported.skills);
   Object.assign(result.paths.skills, imported.paths);
   Object.assign(result.scopes.skills, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function mergeImportHooks(
   result: ImportResult,
   imported: Awaited<ReturnType<typeof importHooks>>,
): void {
   if (Object.keys(imported.hooks).length > 0) {
      for (const scope of Object.values(imported.scopes)) {
         result.sources[scope === 'user' ? 'global' : 'local'] = true;
      }
   }

   Object.assign(result.hooks, imported.hooks);
   Object.assign(result.paths.hooks, imported.paths);
   Object.assign(result.scopes.hooks, imported.scopes);
   result.warnings.push(...imported.warnings);
}

function sanitizeImportedName(name: string): string {
   return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'imported-item';
}

function dedupeImportedName(name: string, used: Set<string>): string {
   const baseName = sanitizeImportedName(name);
   let candidate = baseName,
       index = 1;

   while (used.has(candidate)) {
      candidate = `${baseName}-${index}`;
      index += 1;
   }

   used.add(candidate);
   return candidate;
}

function normalizeImportedRule(
   strategy: RulesStrategy,
   rule: ImportResult['rules'][number],
   usedNames: Set<string>,
): NormalizedImportedRule {
   const normalized: NormalizedImportedRule = {
      name: dedupeImportedName(rule.name, usedNames),
      sourceName: rule.name,
      rawContent: rule.content,
      content: rule.content,
   };

   if (!strategy.parseFrontmatter) {
      return normalized;
   }

   const parsed = strategy.parseFrontmatter(rule.content);

   normalized.content = parsed.content;
   normalized.description = parsed.metadata.description;
   normalized.activation = parsed.metadata.activation;
   normalized.globs = parsed.metadata.globs;

   return normalized;
}

function normalizeImportedPrompt(
   strategy: PromptsStrategy,
   [sourceName, rawContent]: [string, string],
   usedNames: Set<string>,
): NormalizedImportedPrompt {
   const normalized: NormalizedImportedPrompt = {
      name: dedupeImportedName(sourceName, usedNames),
      sourceName,
      rawContent,
      content: rawContent,
   };

   if (!strategy.parseFrontmatter) {
      return normalized;
   }

   const parsed = strategy.parseFrontmatter(rawContent);

   normalized.content = parsed.content;
   normalized.description = parsed.description;
   normalized.argumentHint = Array.isArray(parsed.argumentHint)
      ? parsed.argumentHint.join(', ')
      : parsed.argumentHint;

   return normalized;
}

/**
 * Convert imported editor content into normalized aix data that can be written to ai.json or
 * passed through another editor adapter.
 */
export function normalizeEditorImport(
   editor: EditorName,
   result: ImportResult,
): NormalizedEditorImport {
   const strategies = getAdapter(editor).getStrategyBundle(),
         usedRuleNames = new Set<string>(),
         usedPromptNames = new Set<string>(),
         usedAgentNames = new Set<string>(),
         usedSkillNames = new Set<string>();

   return {
      mcp: result.mcp,
      rules: result.rules.map((rule) => normalizeImportedRule(strategies.rulesStrategy, rule, usedRuleNames)),
      prompts: Object.entries(result.prompts)
         .map((entry) => normalizeImportedPrompt(strategies.promptsStrategy, entry, usedPromptNames)),
      agents: Object.values(result.agents).map((agent) => Object.assign({}, agent, {
         name: dedupeImportedName(agent.name, usedAgentNames),
      })),
      skills: Object.entries(result.skills).map(([sourceName, ref]) => ({
         name: dedupeImportedName(sourceName, usedSkillNames),
         sourceName,
         ref,
      })),
      hooks: result.hooks,
   };
}

/**
 * Build an ai.json-shaped config object from imported editor content. This is the bridge used by
 * `aix init --from` and `aix sync`, so editor-to-editor sync does not require a custom
 * converter for every source/destination pair.
 */
export function buildConfigFromEditorImport(
   editor: EditorName,
   result: ImportResult,
): AiJsonConfig {
   const normalized = normalizeEditorImport(editor, result),
         config = createEmptyConfig();

   config.mcp = normalized.mcp;
   config.rules = Object.fromEntries(
      normalized.rules.map((rule) => {
         const value: Record<string, unknown> = {
            content: rule.content,
         };

         if (rule.description) {
            value.description = rule.description;
         }
         if (rule.activation) {
            value.activation = rule.activation;
         }
         if (rule.globs && rule.globs.length > 0) {
            value.globs = rule.globs;
         }

         return [rule.name, value];
      }),
   );
   config.prompts = Object.fromEntries(
      normalized.prompts.map((prompt) => {
         const value: Record<string, unknown> = {
            content: prompt.content,
         };

         if (prompt.description) {
            value.description = prompt.description;
         }
         if (prompt.argumentHint) {
            value.argumentHint = prompt.argumentHint;
         }

         return [prompt.name, value];
      }),
   );
   config.agents = Object.fromEntries(
      normalized.agents.map((agent) => {
         const value: Record<string, unknown> = {
            content: agent.content,
         };

         if (agent.description) {
            value.description = agent.description;
         }
         if (agent.mode) {
            value.mode = agent.mode;
         }
         if (agent.model) {
            value.model = agent.model;
         }
         if (agent.tools && agent.tools.length > 0) {
            value.tools = agent.tools;
         }
         if (agent.permissions && Object.keys(agent.permissions).length > 0) {
            value.permissions = agent.permissions;
         }
         if (agent.mcp && Object.keys(agent.mcp).length > 0) {
            value.mcp = agent.mcp;
         }
         if (agent.editor && Object.keys(agent.editor).length > 0) {
            value.editor = agent.editor;
         }

         return [agent.name, value];
      }),
   );
   config.skills = Object.fromEntries(normalized.skills.map((skill) => [skill.name, skill.ref]));

   if (Object.keys(normalized.hooks).length > 0) {
      config.hooks = normalized.hooks;
   }

   return config;
}

async function importAgents(
   strategy: AgentsStrategy,
   configDir: string,
   source: 'global' | 'project',
   projectRoot?: string,
): Promise<{
   agents: Record<string, import('./types.js').EditorAgent>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   if (!strategy.isSupported()) {
      return { agents: {}, paths: {}, scopes: {}, warnings: [] };
   }

   if (source === 'global' && strategy.importGlobalAgents) {
      return strategy.importGlobalAgents();
   }

   if (source === 'project' && projectRoot && strategy.importProjectAgents) {
      return strategy.importProjectAgents(projectRoot, configDir);
   }

   const agentsPath = source === 'global'
      ? buildGlobalPath(strategy.getGlobalAgentsPath())
      : buildProjectPath(strategy.getAgentsDir(), projectRoot, configDir);

   if (!agentsPath) {
      return { agents: {}, paths: {}, scopes: {}, warnings: [] };
   }

   try {
      const files = await readdir(agentsPath),
            markdownFiles = files.filter((file) => file.endsWith(strategy.getFileExtension())),
            entries = await Promise.all(
               markdownFiles.map(async (file) => {
                  const filePath = join(agentsPath, file),
                        content = await readFile(filePath, 'utf-8'),
                        sourceName = file.slice(0, -strategy.getFileExtension().length),
                        agent = strategy.parseAgent(sourceName, content);

                  return { name: agent.name, path: filePath, agent };
               }),
            ),
            scope = source === 'global' ? 'user' : 'project';

      return {
         agents: Object.fromEntries(entries.map((entry) => [entry.name, entry.agent])),
         paths: Object.fromEntries(entries.map((entry) => [entry.name, entry.path])),
         scopes: Object.fromEntries(entries.map((entry) => [entry.name, scope])),
         warnings: [],
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return { agents: {}, paths: {}, scopes: {}, warnings: [] };
      }

      return {
         agents: {},
         paths: {},
         scopes: {},
         warnings: [`Failed to read agents at ${agentsPath}: ${(err as Error).message}`],
      };
   }
}

async function importHooks(
   strategy: HooksStrategy,
   configDir: string,
   source: 'global' | 'project',
   projectRoot?: string,
): Promise<{
   hooks: HooksConfig;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const configPath = source === 'global'
      ? buildGlobalPath(strategy.getGlobalConfigPath())
      : buildProjectPath(strategy.getConfigPath(), projectRoot, configDir);

   if (!configPath) {
      return { hooks: {}, paths: {}, scopes: {}, warnings: [] };
   }

   try {
      const content = await readFile(configPath, 'utf-8'),
            parsed = strategy.parseImportedConfig(content),
            scope = source === 'global' ? 'user' : 'project',
            eventNames = Object.keys(parsed.hooks);

      return {
         hooks: parsed.hooks,
         paths: pathMapForNames(eventNames, configPath),
         scopes: scopeMapForNames(eventNames, scope),
         warnings: parsed.warnings,
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return { hooks: {}, paths: {}, scopes: {}, warnings: [] };
      }

      return {
         hooks: {},
         paths: {},
         scopes: {},
         warnings: [`Failed to read hooks config at ${configPath}: ${(err as Error).message}`],
      };
   }
}

/**
 * Import MCP configuration from an editor's global config.
 */
async function importMcpConfig(
   strategy: McpStrategy,
   _configDir: string,
   _source: 'global',
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   return importMcpFromPaths(
      strategy,
      getGlobalMcpImportPaths(strategy),
      'user',
      'global MCP config',
   );
}

/**
 * Import MCP configuration from project-local editor config.
 */
async function importLocalMcpConfig(
   strategy: McpStrategy,
   configDir: string,
   projectRoot: string,
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [];

   // Skip if MCP is not supported for project-local config (e.g., global-only editors)
   if (!strategy.isSupported() || strategy.isGlobalOnly?.()) {
      return { mcp: {}, paths: {}, scopes: {}, warnings };
   }

   for (const fullPath of getLocalMcpImportPaths(strategy, projectRoot, configDir)) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await readFile(fullPath, 'utf-8'),
               result = strategy.parseGlobalMcpConfig(content);

         return {
            ...result,
            paths: pathMapForNames(Object.keys(result.mcp), fullPath),
            scopes: scopeMapForNames(Object.keys(result.mcp), 'project'),
         };
      } catch (err) {
         if (
            (err as NodeJS.ErrnoException).code !== 'ENOENT' &&
            (err as NodeJS.ErrnoException).code !== 'EISDIR'
         ) {
            warnings.push(`Failed to read local MCP config at ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

function getGlobalMcpImportPaths(strategy: McpStrategy): readonly string[] {
   const configuredPaths = strategy.getGlobalImportPaths?.();

   if (configuredPaths && configuredPaths.length > 0) {
      return configuredPaths.map((path) => buildGlobalPath(path)).filter((path): path is string => Boolean(path));
   }

   const defaultPath = buildGlobalPath(strategy.getGlobalMcpConfigPath());

   return defaultPath ? [defaultPath] : [];
}

function getLocalMcpImportPaths(
   strategy: McpStrategy,
   projectRoot: string,
   configDir: string,
): readonly string[] {
   const configuredPaths = strategy.getProjectImportPaths?.(projectRoot, configDir);

   if (configuredPaths && configuredPaths.length > 0) {
      return configuredPaths;
   }

   const defaultPath = buildProjectPath(strategy.getConfigPath(), projectRoot, configDir, strategy.isProjectRootConfig?.());

   return defaultPath ? [defaultPath] : [];
}

async function importMcpFromPaths(
   strategy: McpStrategy,
   paths: readonly string[],
   scope: ImportScope,
   label: string,
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [];

   for (const fullPath of paths) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await readFile(fullPath, 'utf-8'),
               result = strategy.parseGlobalMcpConfig(content);

         return {
            ...result,
            paths: pathMapForNames(Object.keys(result.mcp), fullPath),
            scopes: scopeMapForNames(Object.keys(result.mcp), scope),
         };
      } catch (err) {
         if (
            (err as NodeJS.ErrnoException).code !== 'ENOENT' &&
            (err as NodeJS.ErrnoException).code !== 'EISDIR'
         ) {
            warnings.push(`Failed to read ${label} at ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import rules from an editor's global config. Tags each rule with the name 'global'.
 */
async function importGlobalRules(
   strategy: RulesStrategy,
   _configDir: string,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   if (strategy.importGlobalRules) {
      return strategy.importGlobalRules();
   }

   const warnings: string[] = [],
         rulesPath = strategy.getGlobalRulesPath(),
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   if (rulesPath) {
      const fullPath = join(homedir(), rulesPath);

      try {
         const content = await readFile(fullPath, 'utf-8'),
               parsed = strategy.parseGlobalRules(content);

         for (const [index, rule] of parsed.rules.entries()) {
            const name = index === 0 ? 'global' : `global-${index + 1}`;

            rules.push({ content: rule, name, path: fullPath, scope: 'user' });
            paths[name] = fullPath;
            scopes[name] = 'user';
         }
         warnings.push(...parsed.warnings);
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global rules from ${fullPath}: ${(err as Error).message}`,
            );
         }
      }
   }

   const ruleDirs = strategy.getGlobalRuleImportDirs?.() ?? [];

   for (const ruleDir of ruleDirs) {
      const fullPath = join(homedir(), ruleDir);

      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const files = await readdir(fullPath),
               ext = strategy.getFileExtension(),
               ruleFiles = files.filter((file) => file.endsWith(ext)).toSorted();

         for (const file of ruleFiles) {
            const path = join(fullPath, file),
                  name = file.slice(0, -ext.length);

            // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
            const rule = await readGlobalRuleFile(path, name, warnings);

            if (rule) {
               rules.push(rule);
               paths[name] = path;
               scopes[name] = 'user';
            }
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global rules from ${fullPath}: ${(err as Error).message}`,
            );
         }
      }
   }

   return { rules, paths, scopes, warnings };
}

async function readGlobalRuleFile(
   path: string,
   name: string,
   warnings: string[],
): Promise<NamedRule | undefined> {
   try {
      const content = await readFile(path, 'utf-8'),
            trimmed = content.trim();

      if (!trimmed) {
         return undefined;
      }

      return { content: trimmed, name, path, scope: 'user' };
   } catch (err) {
      warnings.push(`Failed to read global rule ${path}: ${(err as Error).message}`);
      return undefined;
   }
}

/**
 * Import rules from project-local editor config. Tags each rule with its filename (sans extension).
 */
async function importLocalRules(
   strategy: RulesStrategy,
   configDir: string,
   projectRoot: string,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   if (strategy.importProjectRules) {
      return strategy.importProjectRules(projectRoot, configDir);
   }

   const warnings: string[] = [],
         rulesDir = strategy.getRulesDir(),
         fullPath = join(projectRoot, configDir, rulesDir);

   try {
      const files = await readdir(fullPath),
            ext = strategy.getFileExtension(),
            ruleFiles = files.filter((f) => f.endsWith(ext)),
            rules: NamedRule[] = [],
            paths: Record<string, string> = {},
            scopes: Record<string, ImportScope> = {};

      for (const file of ruleFiles) {
         try {
            const path = join(fullPath, file);
            // eslint-disable-next-line no-await-in-loop -- Sequential for simplicity
            const content = await readFile(path, 'utf-8'),
                  name = file.endsWith(ext) ? file.slice(0, -ext.length) : file;

            rules.push({ content, name, path, scope: 'project' });
            paths[name] = path;
            scopes[name] = 'project';
         } catch {
            // Skip files that can't be read
         }
      }

      return { rules, paths, scopes, warnings };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local rules from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

/**
 * Import prompts/workflows from an editor's global config.
 */
async function importPrompts(
   strategy: PromptsStrategy,
   _configDir: string,
   _source: 'global',
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   if (strategy.importGlobalPrompts) {
      return strategy.importGlobalPrompts();
   }

   const warnings: string[] = [],
         promptsPath = strategy.getGlobalPromptsPath();

   if (!promptsPath) {
      return { prompts: {}, paths: {}, scopes: {}, warnings };
   }

   const fullPath = join(homedir(), promptsPath);

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            },
            result = await strategy.parseGlobalPrompts(files, fileReader);

      const imported = {
         ...result,
         paths: promptPathMap(Object.keys(result.prompts), files, fullPath),
         scopes: scopeMapForNames(Object.keys(result.prompts), 'user'),
      };

      return imported;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import prompts/workflows from project-local editor config.
 */
async function importLocalPrompts(
   strategy: PromptsStrategy,
   configDir: string,
   projectRoot: string,
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   if (strategy.importProjectPrompts) {
      return strategy.importProjectPrompts(projectRoot, configDir);
   }

   const warnings: string[] = [],
         promptsDir = strategy.getPromptsDir(),
         fullPath = join(projectRoot, configDir, promptsDir);

   if (!strategy.isSupported()) {
      return { prompts: {}, paths: {}, scopes: {}, warnings };
   }

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            },
            result = await strategy.parseGlobalPrompts(files, fileReader);

      const imported = {
         ...result,
         paths: promptPathMap(Object.keys(result.prompts), files, fullPath),
         scopes: scopeMapForNames(Object.keys(result.prompts), 'project'),
      };

      return imported;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

async function importSkills(
   strategy: SkillsStrategy,
   source: ImportScope,
   projectRoot: string,
): Promise<ImportedSkillsResult> {
   const warnings: string[] = [],
         skills: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {},
         skillDirs = source === 'user' ? strategy.getGlobalImportDirs() : strategy.getProjectImportDirs(),
         root = source === 'user' ? homedir() : projectRoot;

   for (const skillDir of skillDirs) {
      const fullPath = join(root, skillDir);

      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const entries = await readdir(fullPath, { withFileTypes: true });

         for (const entry of entries) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) {
               continue;
            }

            const path = join(fullPath, entry.name);

            if (!existsSync(join(path, 'SKILL.md'))) {
               continue;
            }
            skills[entry.name] = path;
            paths[entry.name] = path;
            scopes[entry.name] = source;
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read skills from ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { skills, paths, scopes, warnings };
}

function pathMapForNames(names: string[], path: string): Record<string, string> {
   return Object.fromEntries(names.map((name) => [name, path]));
}

function scopeMapForNames(names: string[], scope: ImportScope): Record<string, ImportScope> {
   return Object.fromEntries(names.map((name) => [name, scope]));
}

function promptPathMap(names: string[], files: string[], basePath: string): Record<string, string> {
   const fileByName = new Map(files.map((file) => [file.replace(/\.md$/, ''), file]));

   return Object.fromEntries(
      names.flatMap((name) => {
         const file = fileByName.get(name);

         return file ? [[name, join(basePath, file)]] : [];
      }),
   );
}

/**
 * Get the global config path for an editor.
 */
export function getGlobalConfigPath(editor: EditorName): string | null {
   return buildGlobalPath(getAdapter(editor).getStrategyBundle().mcpStrategy.getGlobalMcpConfigPath());
}
