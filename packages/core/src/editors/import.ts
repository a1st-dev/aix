import { dirname, isAbsolute, join } from 'pathe';
import { parseJsonc, type McpServerConfig } from '@a1st/aix-schema';
import type { EditorName } from './types.js';
import type { McpStrategy, RulesStrategy, PromptsStrategy } from './strategies/types.js';
import type { NamedRule } from '../import-writer.js';
import { WindsurfRulesStrategy } from './strategies/windsurf/rules.js';
import { WindsurfPromptsStrategy } from './strategies/windsurf/prompts.js';
import { WindsurfMcpStrategy } from './strategies/windsurf/mcp.js';
import { StandardMcpStrategy } from './strategies/shared/standard-mcp.js';
import { CursorRulesStrategy } from './strategies/cursor/rules.js';
import { CursorPromptsStrategy } from './strategies/cursor/prompts.js';
import { ClaudeCodeMcpStrategy } from './strategies/claude-code/mcp.js';
import { ClaudeCodeRulesStrategy } from './strategies/claude-code/rules.js';
import { ClaudeCodePromptsStrategy } from './strategies/claude-code/prompts.js';
import { CopilotMcpStrategy } from './strategies/copilot/mcp.js';
import { CopilotRulesStrategy } from './strategies/copilot/rules.js';
import { CopilotPromptsStrategy } from './strategies/copilot/prompts.js';
import { ZedMcpStrategy } from './strategies/zed/mcp.js';
import { ZedRulesStrategy } from './strategies/zed/rules.js';
import { ZedPromptsStrategy } from './strategies/zed/prompts.js';
import { CodexRulesStrategy } from './strategies/codex/rules.js';
import { CodexPromptsStrategy } from './strategies/codex/prompts.js';
import { CodexMcpStrategy } from './strategies/codex/mcp.js';
import { GeminiRulesStrategy } from './strategies/gemini/rules.js';
import { GeminiPromptsStrategy } from './strategies/gemini/prompts.js';
import { GeminiMcpStrategy } from './strategies/gemini/mcp.js';
import { OpenCodeRulesStrategy } from './strategies/opencode/rules.js';
import { OpenCodePromptsStrategy } from './strategies/opencode/prompts.js';
import { OpenCodeMcpStrategy } from './strategies/opencode/mcp.js';
import { getRuntimeAdapter, type RuntimeDirent } from '../runtime/index.js';

type ImportScope = 'project' | 'user';

function existsSync(path: string): boolean {
   return getRuntimeAdapter().fs.existsSync(path);
}

function homedir(): string {
   return getRuntimeAdapter().os.homedir();
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

export interface ImportResult {
   mcp: Record<string, McpServerConfig>;
   rules: NamedRule[];
   skills: Record<string, string>;
   prompts: Record<string, string>;
   paths: {
      mcp: Record<string, string>;
      rules: Record<string, string>;
      skills: Record<string, string>;
      prompts: Record<string, string>;
   };
   scopes: {
      mcp: Record<string, ImportScope>;
      rules: Record<string, ImportScope>;
      skills: Record<string, ImportScope>;
      prompts: Record<string, ImportScope>;
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
}

interface ImportStrategies {
   mcp: McpStrategy;
   rules: RulesStrategy;
   prompts: PromptsStrategy;
}

/**
 * Get the import strategies for an editor.
 */
function getImportStrategies(editor: EditorName): ImportStrategies {
   switch (editor) {
   case 'windsurf':
      return {
         mcp: new WindsurfMcpStrategy(),
         rules: new WindsurfRulesStrategy(),
         prompts: new WindsurfPromptsStrategy(),
      };
   case 'cursor':
      return {
         mcp: new StandardMcpStrategy(),
         rules: new CursorRulesStrategy(),
         prompts: new CursorPromptsStrategy(),
      };
   case 'claude-code':
      return {
         mcp: new ClaudeCodeMcpStrategy(),
         rules: new ClaudeCodeRulesStrategy(),
         prompts: new ClaudeCodePromptsStrategy(),
      };
   case 'copilot':
      return {
         mcp: new CopilotMcpStrategy(),
         rules: new CopilotRulesStrategy(),
         prompts: new CopilotPromptsStrategy(),
      };
   case 'zed':
      return {
         mcp: new ZedMcpStrategy(),
         rules: new ZedRulesStrategy(),
         prompts: new ZedPromptsStrategy(),
      };
   case 'codex':
      return {
         mcp: new CodexMcpStrategy(),
         rules: new CodexRulesStrategy(),
         prompts: new CodexPromptsStrategy(),
      };
   case 'gemini':
      return {
         mcp: new GeminiMcpStrategy(),
         rules: new GeminiRulesStrategy(),
         prompts: new GeminiPromptsStrategy(),
      };
   case 'opencode':
      return {
         mcp: new OpenCodeMcpStrategy(),
         rules: new OpenCodeRulesStrategy(),
         prompts: new OpenCodePromptsStrategy(),
      };
   }
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
            paths: { mcp: {}, rules: {}, skills: {}, prompts: {} },
            scopes: { mcp: {}, rules: {}, skills: {}, prompts: {} },
            warnings: [],
            sources: { global: false, local: false },
         },
         strategies = getImportStrategies(editor),
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd();

   // 1. Import from GLOBAL config first (base layer)
   const globalMcp = await importMcpConfig(strategies.mcp, editor, 'global');

   if (Object.keys(globalMcp.mcp).length > 0) {
      result.sources.global = true;
   }
   Object.assign(result.mcp, globalMcp.mcp);
   Object.assign(result.paths.mcp, globalMcp.paths);
   Object.assign(result.scopes.mcp, globalMcp.scopes);
   result.warnings.push(...globalMcp.warnings);

   const globalRules = await importGlobalRules(strategies.rules, editor);

   if (globalRules.rules.length > 0) {
      result.sources.global = true;
   }
   result.rules.push(...globalRules.rules);
   Object.assign(result.paths.rules, globalRules.paths);
   Object.assign(result.scopes.rules, globalRules.scopes);
   result.warnings.push(...globalRules.warnings);

   const globalPrompts = await importPrompts(strategies.prompts, editor, 'global');

   if (Object.keys(globalPrompts.prompts).length > 0) {
      result.sources.global = true;
   }
   Object.assign(result.prompts, globalPrompts.prompts);
   Object.assign(result.paths.prompts, globalPrompts.paths);
   Object.assign(result.scopes.prompts, globalPrompts.scopes);
   result.warnings.push(...globalPrompts.warnings);

   const globalSkills = await importGlobalSkills(editor);

   if (Object.keys(globalSkills.skills).length > 0) {
      result.sources.global = true;
   }
   Object.assign(result.skills, globalSkills.skills);
   Object.assign(result.paths.skills, globalSkills.paths);
   Object.assign(result.scopes.skills, globalSkills.scopes);
   result.warnings.push(...globalSkills.warnings);

   // 2. Import from LOCAL editor config (overlay - overrides global)
   const localMcp = await importLocalMcpConfig(strategies.mcp, editor, projectRoot);

   if (Object.keys(localMcp.mcp).length > 0) {
      result.sources.local = true;
   }
   Object.assign(result.mcp, localMcp.mcp);
   Object.assign(result.paths.mcp, localMcp.paths);
   Object.assign(result.scopes.mcp, localMcp.scopes);
   result.warnings.push(...localMcp.warnings);

   const localRules = await importLocalRules(strategies.rules, editor, projectRoot);

   if (localRules.rules.length > 0) {
      result.sources.local = true;
   }
   result.rules.push(...localRules.rules);
   Object.assign(result.paths.rules, localRules.paths);
   Object.assign(result.scopes.rules, localRules.scopes);
   result.warnings.push(...localRules.warnings);

   const localPrompts = await importLocalPrompts(strategies.prompts, editor, projectRoot);

   if (Object.keys(localPrompts.prompts).length > 0) {
      result.sources.local = true;
   }
   Object.assign(result.prompts, localPrompts.prompts);
   Object.assign(result.paths.prompts, localPrompts.paths);
   Object.assign(result.scopes.prompts, localPrompts.scopes);
   result.warnings.push(...localPrompts.warnings);

   const localSkills = await importLocalSkills(editor, projectRoot);

   if (Object.keys(localSkills.skills).length > 0) {
      result.sources.local = true;
   }
   Object.assign(result.skills, localSkills.skills);
   Object.assign(result.paths.skills, localSkills.paths);
   Object.assign(result.scopes.skills, localSkills.scopes);
   result.warnings.push(...localSkills.warnings);

   return result;
}

/** Editor config directory names */
const EDITOR_CONFIG_DIRS: Record<EditorName, string> = {
   windsurf: '.windsurf',
   cursor: '.cursor',
   'claude-code': '.claude',
   copilot: '.vscode',
   zed: '.zed',
   codex: '.codex',
   gemini: '.gemini',
   opencode: '.opencode',
};

const EDITOR_SKILL_DIRS: Record<EditorName, string[]> = {
   windsurf: ['.windsurf/skills'],
   cursor: ['.cursor/skills'],
   'claude-code': ['.claude/skills'],
   copilot: ['.github/skills'],
   zed: ['.aix/skills'],
   codex: ['.agents/skills'],
   gemini: ['.gemini/skills'],
   opencode: ['.opencode/skills'],
};

const EDITOR_GLOBAL_RULE_DIRS: Partial<Record<EditorName, string[]>> = {
   'claude-code': ['.claude/rules'],
};

const EDITOR_GLOBAL_SKILL_DIRS: Partial<Record<EditorName, string[]>> = {
   windsurf: ['.windsurf/skills'],
   cursor: ['.cursor/skills'],
   'claude-code': ['.claude/skills'],
   copilot: ['.github/skills'],
   codex: ['.codex/skills'],
   gemini: ['.gemini/skills'],
   opencode: ['.config/opencode/skills'],
};

/**
 * Import MCP configuration from an editor's global config.
 */
async function importMcpConfig(
   strategy: McpStrategy,
   editor: EditorName,
   _source: 'global',
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         configPath = strategy.getGlobalMcpConfigPath();

   if (!configPath) {
      // Not a warning - some editors don't have global MCP config
      return { mcp: {}, paths: {}, scopes: {}, warnings };
   }

   const fullPath = editor === 'opencode'
      ? resolveOpenCodeConfigPath(join(homedir(), configPath))
      : join(homedir(), configPath);

   try {
      const content = await readFile(fullPath, 'utf-8'),
            result = strategy.parseGlobalMcpConfig(content);

      return {
         ...result,
         paths: pathMapForNames(Object.keys(result.mcp), fullPath),
         scopes: scopeMapForNames(Object.keys(result.mcp), 'user'),
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(
            `Failed to read global MCP config at ${fullPath}: ${(err as Error).message}`,
         );
      }
   }

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import MCP configuration from project-local editor config.
 */
async function importLocalMcpConfig(
   strategy: McpStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{
   mcp: Record<string, McpServerConfig>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         mcpConfigPath = strategy.getConfigPath(),
         baseDir = strategy.isProjectRootConfig?.() ? projectRoot : join(projectRoot, configDir),
         fullPath = editor === 'opencode'
            ? resolveOpenCodeConfigPath(join(baseDir, mcpConfigPath))
            : join(baseDir, mcpConfigPath);

   // Skip if MCP is not supported for project-local config (e.g., global-only editors)
   if (!strategy.isSupported() || strategy.isGlobalOnly?.()) {
      return { mcp: {}, paths: {}, scopes: {}, warnings };
   }

   try {
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

   return { mcp: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import rules from an editor's global config. Tags each rule with the name 'global'.
 */
async function importGlobalRules(
   strategy: RulesStrategy,
   editor: EditorName,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
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

   if (editor === 'opencode') {
      const configPath = resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
            imported = await importOpenCodeInstructionRules(configPath, dirname(configPath), 'user');

      rules.push(...imported.rules);
      Object.assign(paths, imported.paths);
      Object.assign(scopes, imported.scopes);
      warnings.push(...imported.warnings);
   }

   const ruleDirs = EDITOR_GLOBAL_RULE_DIRS[editor] ?? [];

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
   editor: EditorName,
   projectRoot: string,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   // Codex uses AGENTS.md at the project root (not inside .codex/), so use a dedicated reader
   if (editor === 'codex') {
      return importCodexLocalRules(projectRoot);
   }

   // Gemini uses GEMINI.md at the project root (not inside .gemini/), similar to Codex
   if (editor === 'gemini') {
      return importGeminiLocalRules(projectRoot);
   }

   if (editor === 'opencode') {
      return importOpenCodeLocalRules(projectRoot);
   }

   if (editor === 'zed') {
      return importZedLocalRules(projectRoot);
   }

   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
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

async function importZedLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         rulesPath = join(projectRoot, '.rules');

   try {
      const content = await readFile(rulesPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               {
                  content: content.trim(),
                  name: 'project rules',
                  path: rulesPath,
                  scope: 'project',
               },
            ],
            paths: { 'project rules': rulesPath },
            scopes: { 'project rules': 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Zed rules from ${rulesPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

/**
 * Import Codex rules from AGENTS.md at the project root. Codex discovers one AGENTS.md per
 * directory from root→CWD, so we read the root file and tag it accordingly.
 */
async function importCodexLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         agentsPath = join(projectRoot, 'AGENTS.md');

   try {
      const content = await readFile(agentsPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               { content: content.trim(), name: 'AGENTS', path: agentsPath, scope: 'project' },
            ],
            paths: { AGENTS: agentsPath },
            scopes: { AGENTS: 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Codex rules from ${agentsPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

/**
 * Import Gemini rules from GEMINI.md at the project root. Gemini CLI reads GEMINI.md for
 * project-level context and instructions.
 */
async function importGeminiLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         geminiPath = join(projectRoot, 'GEMINI.md');

   try {
      const content = await readFile(geminiPath, 'utf-8');

      if (content.trim()) {
         return {
            rules: [
               { content: content.trim(), name: 'GEMINI', path: geminiPath, scope: 'project' },
            ],
            paths: { GEMINI: geminiPath },
            scopes: { GEMINI: 'project' },
            warnings,
         };
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read Gemini rules from ${geminiPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], paths: {}, scopes: {}, warnings };
}

async function importOpenCodeLocalRules(projectRoot: string): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         agentsPath = join(projectRoot, 'AGENTS.md'),
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   try {
      const content = await readFile(agentsPath, 'utf-8');

      if (content.trim()) {
         rules.push({ content: content.trim(), name: 'AGENTS', path: agentsPath, scope: 'project' });
         paths.AGENTS = agentsPath;
         scopes.AGENTS = 'project';
      }
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read OpenCode rules from ${agentsPath}: ${(err as Error).message}`);
      }
   }

   const imported = await importOpenCodeInstructionRules(
      resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')),
      projectRoot,
      'project',
   );

   rules.push(...imported.rules);
   Object.assign(paths, imported.paths);
   Object.assign(scopes, imported.scopes);
   warnings.push(...imported.warnings);

   return { rules, paths, scopes, warnings };
}

/**
 * Import prompts/workflows from an editor's global config.
 */
async function importPrompts(
   strategy: PromptsStrategy,
   editor: EditorName,
   _source: 'global',
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
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

      if (editor !== 'opencode') {
         return imported;
      }

      return mergePromptImports(
         await importOpenCodeConfigPrompts(
            resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
            'user',
         ),
         imported,
      );
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   if (editor === 'opencode') {
      return importOpenCodeConfigPrompts(
         resolveOpenCodeConfigPath(join(homedir(), '.config/opencode/opencode.json')),
         'user',
      );
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

/**
 * Import prompts/workflows from project-local editor config.
 */
async function importLocalPrompts(
   strategy: PromptsStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
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

      if (editor !== 'opencode') {
         return imported;
      }

      return mergePromptImports(
         await importOpenCodeConfigPrompts(resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')), 'project'),
         imported,
      );
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   if (editor === 'opencode') {
      return importOpenCodeConfigPrompts(resolveOpenCodeConfigPath(join(projectRoot, 'opencode.json')), 'project');
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

interface OpenCodeConfigCommand {
   template?: unknown;
   description?: unknown;
}

interface OpenCodeConfig {
   instructions?: unknown;
   command?: Record<string, OpenCodeConfigCommand>;
}

async function readOpenCodeConfig(configPath: string): Promise<OpenCodeConfig | null> {
   try {
      const parsed = parseJsonc<OpenCodeConfig>(await readFile(configPath, 'utf-8'));

      if (parsed.errors.length > 0 || !parsed.data) {
         throw new Error('invalid JSONC');
      }

      return parsed.data;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return null;
      }
      throw err;
   }
}

function resolveOpenCodeConfigPath(jsonPath: string): string {
   if (existsSync(jsonPath)) {
      return jsonPath;
   }

   const jsoncPath = jsonPath.replace(/\.json$/, '.jsonc');

   return existsSync(jsoncPath) ? jsoncPath : jsonPath;
}

async function importOpenCodeInstructionRules(
   configPath: string,
   baseDir: string,
   scope: ImportScope,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { rules, paths, scopes, warnings };
   }

   if (!Array.isArray(config?.instructions)) {
      return { rules, paths, scopes, warnings };
   }

   for (const instruction of config.instructions) {
      if (typeof instruction !== 'string') {
         warnings.push(`Skipping OpenCode instruction from ${configPath}: expected string path`);
         continue;
      }

      // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
      const imported = await importOpenCodeInstructionPattern(instruction, baseDir, scope);

      rules.push(...imported.rules);
      Object.assign(paths, imported.paths);
      Object.assign(scopes, imported.scopes);
      warnings.push(...imported.warnings);
   }

   return { rules, paths, scopes, warnings };
}

async function importOpenCodeInstructionPattern(
   instruction: string,
   baseDir: string,
   scope: ImportScope,
): Promise<{
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const pathsToRead = hasGlobSyntax(instruction)
            ? await expandInstructionGlob(instruction, baseDir)
            : [resolveInstructionPath(instruction, baseDir)],
         rules: NamedRule[] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {},
         warnings: string[] = [];

   if (pathsToRead.length === 0) {
      warnings.push(`OpenCode instruction pattern matched no files: ${instruction}`);
   }

   for (const path of pathsToRead) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await readFile(path, 'utf-8'),
               name = basenameWithoutMarkdown(path);

         if (!content.trim()) {
            continue;
         }
         rules.push({ content: content.trim(), name, path, scope });
         paths[name] = path;
         scopes[name] = scope;
      } catch (err) {
         warnings.push(`Failed to read OpenCode instruction ${path}: ${(err as Error).message}`);
      }
   }

   return { rules, paths, scopes, warnings };
}

async function expandInstructionGlob(pattern: string, baseDir: string): Promise<string[]> {
   const root = isAbsolute(pattern) ? getGlobRoot(pattern) : baseDir,
         files = await listFilesRecursive(root),
         matcher = globToRegExp(isAbsolute(pattern) ? pattern : join(baseDir, pattern));

   return files.filter((file) => matcher.test(file)).toSorted();
}

async function listFilesRecursive(root: string): Promise<string[]> {
   const result: string[] = [];

   async function visit(dir: string): Promise<void> {
      let entries: RuntimeDirent[];

      try {
         entries = await readdir(dir, { withFileTypes: true }) as RuntimeDirent[];
      } catch {
         return;
      }

      for (const entry of entries) {
         const path = join(dir, entry.name);

         if (entry.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop -- Recursive walk is easier to reason about sequentially
            await visit(path);
         } else if (entry.isFile()) {
            result.push(path);
         }
      }
   }

   await visit(root);
   return result;
}

function hasGlobSyntax(value: string): boolean {
   return /[*?[\]{}]/.test(value);
}

function getGlobRoot(pattern: string): string {
   const parts = pattern.split('/'),
         rootParts: string[] = [];

   for (const part of parts) {
      if (hasGlobSyntax(part)) {
         break;
      }
      rootParts.push(part);
   }

   return rootParts.join('/') || '/';
}

function globToRegExp(pattern: string): RegExp {
   const segments = pattern.split('/');
   let normalized = '^',
       startIndex = 0;

   if (segments[0] === '') {
      normalized += '/';
      startIndex = 1;
   }

   for (let i = startIndex; i < segments.length; i++) {
      const segment = segments[i] ?? '',
            isLast = i === segments.length - 1;

      if (segment === '**') {
         normalized += '(?:[^/]+/)*';
         continue;
      }

      normalized += escapeGlobSegment(segment);

      if (!isLast) {
         normalized += '/';
      }
   }

   return new RegExp(`${normalized}$`);
}

function escapeGlobSegment(segment: string): string {
   return segment
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
}

function resolveInstructionPath(instruction: string, baseDir: string): string {
   return isAbsolute(instruction) ? instruction : join(baseDir, instruction);
}

function basenameWithoutMarkdown(path: string): string {
   const name = path.split('/').pop() ?? 'instruction';

   return name.replace(/\.(md|markdown|txt)$/i, '');
}

async function importOpenCodeConfigPrompts(
   configPath: string,
   scope: ImportScope,
): Promise<{
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const prompts: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {},
         warnings: string[] = [];

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { prompts, paths, scopes, warnings };
   }

   if (!config?.command) {
      return { prompts, paths, scopes, warnings };
   }

   for (const [name, command] of Object.entries(config.command)) {
      if (typeof command.template !== 'string') {
         warnings.push(`Skipping OpenCode command "${name}" from ${configPath}: missing template`);
         continue;
      }

      prompts[name] = formatOpenCodeConfigPrompt(command);
      paths[name] = configPath;
      scopes[name] = scope;
   }

   return { prompts, paths, scopes, warnings };
}

function formatOpenCodeConfigPrompt(command: OpenCodeConfigCommand): string {
   if (typeof command.description !== 'string' || !command.description) {
      return String(command.template);
   }

   return `---\ndescription: ${JSON.stringify(command.description)}\n---\n\n${String(command.template)}`;
}

function mergePromptImports(
   base: {
      prompts: Record<string, string>;
      paths: Record<string, string>;
      scopes: Record<string, ImportScope>;
      warnings: string[];
   },
   overlay: {
      prompts: Record<string, string>;
      paths: Record<string, string>;
      scopes: Record<string, ImportScope>;
      warnings: string[];
   },
): {
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
} {
   return {
      prompts: { ...base.prompts, ...overlay.prompts },
      paths: { ...base.paths, ...overlay.paths },
      scopes: { ...base.scopes, ...overlay.scopes },
      warnings: [...base.warnings, ...overlay.warnings],
   };
}

async function importLocalSkills(
   editor: EditorName,
   projectRoot: string,
): Promise<{
   skills: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         skills: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   for (const skillDir of EDITOR_SKILL_DIRS[editor]) {
      const fullPath = join(projectRoot, skillDir);

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
            scopes[entry.name] = 'project';
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(`Failed to read skills from ${fullPath}: ${(err as Error).message}`);
         }
      }
   }

   return { skills, paths, scopes, warnings };
}

async function importGlobalSkills(editor: EditorName): Promise<{
   skills: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, ImportScope>;
   warnings: string[];
}> {
   const warnings: string[] = [],
         skills: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, ImportScope> = {};

   for (const skillDir of EDITOR_GLOBAL_SKILL_DIRS[editor] ?? []) {
      const fullPath = join(homedir(), skillDir);

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
            scopes[entry.name] = 'user';
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            warnings.push(
               `Failed to read global skills from ${fullPath}: ${(err as Error).message}`,
            );
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
   const strategies = getImportStrategies(editor),
         configPath = strategies.mcp.getGlobalMcpConfigPath();

   if (!configPath) {
      return null;
   }
   return join(homedir(), configPath);
}
