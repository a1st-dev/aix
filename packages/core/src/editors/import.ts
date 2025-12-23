import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'pathe';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { EditorName } from './types.js';
import type { McpStrategy, RulesStrategy, PromptsStrategy } from './strategies/types.js';
import { WindsurfRulesStrategy } from './strategies/windsurf/rules.js';
import { WindsurfPromptsStrategy } from './strategies/windsurf/prompts.js';
import { WindsurfMcpStrategy } from './strategies/windsurf/mcp.js';
import { StandardMcpStrategy } from './strategies/shared/standard-mcp.js';
import { CursorRulesStrategy } from './strategies/cursor/rules.js';
import { CursorPromptsStrategy } from './strategies/cursor/prompts.js';
import { ClaudeCodeMcpStrategy } from './strategies/claude-code/mcp.js';
import { ClaudeCodeRulesStrategy } from './strategies/claude-code/rules.js';
import { ClaudeCodePromptsStrategy } from './strategies/claude-code/prompts.js';
import { VSCodeMcpStrategy } from './strategies/vscode/mcp.js';
import { VSCodeRulesStrategy } from './strategies/vscode/rules.js';
import { VSCodePromptsStrategy } from './strategies/vscode/prompts.js';
import { ZedMcpStrategy } from './strategies/zed/mcp.js';
import { ZedRulesStrategy } from './strategies/zed/rules.js';
import { ZedPromptsStrategy } from './strategies/zed/prompts.js';
import { CodexRulesStrategy } from './strategies/codex/rules.js';
import { CodexPromptsStrategy } from './strategies/codex/prompts.js';
import { CodexMcpStrategy } from './strategies/codex/mcp.js';

export interface ImportResult {
   mcp: Record<string, McpServerConfig>;
   rules: string[];
   skills: Record<string, string>;
   prompts: Record<string, string>;
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
   case 'vscode':
      return {
         mcp: new VSCodeMcpStrategy(),
         rules: new VSCodeRulesStrategy(),
         prompts: new VSCodePromptsStrategy(),
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
            warnings: [],
            sources: { global: false, local: false },
         },
         strategies = getImportStrategies(editor),
         projectRoot = options.projectRoot ?? process.cwd();

   // 1. Import from GLOBAL config first (base layer)
   const globalMcp = await importMcpConfig(strategies.mcp, editor, 'global');

   if (Object.keys(globalMcp.mcp).length > 0) {
      result.sources.global = true;
   }
   Object.assign(result.mcp, globalMcp.mcp);
   result.warnings.push(...globalMcp.warnings);

   const globalRules = await importRules(strategies.rules, 'global');

   if (globalRules.rules.length > 0) {
      result.sources.global = true;
   }
   result.rules.push(...globalRules.rules);
   result.warnings.push(...globalRules.warnings);

   const globalPrompts = await importPrompts(strategies.prompts, 'global');

   if (Object.keys(globalPrompts.prompts).length > 0) {
      result.sources.global = true;
   }
   Object.assign(result.prompts, globalPrompts.prompts);
   result.warnings.push(...globalPrompts.warnings);

   // 2. Import from LOCAL editor config (overlay - overrides global)
   const localMcp = await importLocalMcpConfig(strategies.mcp, editor, projectRoot);

   if (Object.keys(localMcp.mcp).length > 0) {
      result.sources.local = true;
   }
   Object.assign(result.mcp, localMcp.mcp);
   result.warnings.push(...localMcp.warnings);

   const localRules = await importLocalRules(strategies.rules, editor, projectRoot);

   if (localRules.rules.length > 0) {
      result.sources.local = true;
   }
   result.rules.push(...localRules.rules);
   result.warnings.push(...localRules.warnings);

   const localPrompts = await importLocalPrompts(strategies.prompts, editor, projectRoot);

   if (Object.keys(localPrompts.prompts).length > 0) {
      result.sources.local = true;
   }
   Object.assign(result.prompts, localPrompts.prompts);
   result.warnings.push(...localPrompts.warnings);

   return result;
}

/** Editor config directory names */
const EDITOR_CONFIG_DIRS: Record<EditorName, string> = {
   windsurf: '.windsurf',
   cursor: '.cursor',
   'claude-code': '.claude',
   vscode: '.vscode',
   zed: '.zed',
   codex: '.codex',
};

/**
 * Import MCP configuration from an editor's global config.
 */
async function importMcpConfig(
   strategy: McpStrategy,
   _editor: EditorName,
   _source: 'global',
): Promise<{ mcp: Record<string, McpServerConfig>; warnings: string[] }> {
   const warnings: string[] = [],
         configPath = strategy.getGlobalMcpConfigPath();

   if (!configPath) {
      // Not a warning - some editors don't have global MCP config
      return { mcp: {}, warnings };
   }

   const fullPath = join(homedir(), configPath);

   try {
      const content = await readFile(fullPath, 'utf-8'),
            result = strategy.parseGlobalMcpConfig(content);

      return result;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global MCP config at ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { mcp: {}, warnings };
}

/**
 * Import MCP configuration from project-local editor config.
 */
async function importLocalMcpConfig(
   strategy: McpStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{ mcp: Record<string, McpServerConfig>; warnings: string[] }> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         mcpConfigPath = strategy.getConfigPath(),
         fullPath = join(projectRoot, configDir, mcpConfigPath);

   // Skip if MCP is not supported for project-local config (e.g., global-only editors)
   if (!strategy.isSupported() || strategy.isGlobalOnly?.()) {
      return { mcp: {}, warnings };
   }

   try {
      const content = await readFile(fullPath, 'utf-8'),
            result = strategy.parseGlobalMcpConfig(content);

      return result;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' &&
          (err as NodeJS.ErrnoException).code !== 'EISDIR') {
         warnings.push(`Failed to read local MCP config at ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { mcp: {}, warnings };
}

/**
 * Import rules from an editor's global config.
 */
async function importRules(
   strategy: RulesStrategy,
   _source: 'global',
): Promise<{ rules: string[]; warnings: string[] }> {
   const warnings: string[] = [],
         rulesPath = strategy.getGlobalRulesPath();

   if (!rulesPath) {
      return { rules: [], warnings };
   }

   const fullPath = join(homedir(), rulesPath);

   try {
      const content = await readFile(fullPath, 'utf-8');

      return strategy.parseGlobalRules(content);
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global rules from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], warnings };
}

/**
 * Import rules from project-local editor config.
 */
async function importLocalRules(
   strategy: RulesStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{ rules: string[]; warnings: string[] }> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         rulesDir = strategy.getRulesDir(),
         fullPath = join(projectRoot, configDir, rulesDir);

   try {
      const files = await readdir(fullPath),
            ext = strategy.getFileExtension(),
            ruleFiles = files.filter((f) => f.endsWith(ext)),
            rules: string[] = [];

      for (const file of ruleFiles) {
         try {
            // eslint-disable-next-line no-await-in-loop -- Sequential for simplicity
            const content = await readFile(join(fullPath, file), 'utf-8');

            rules.push(content);
         } catch {
            // Skip files that can't be read
         }
      }

      return { rules, warnings };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local rules from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { rules: [], warnings };
}

/**
 * Import prompts/workflows from an editor's global config.
 */
async function importPrompts(
   strategy: PromptsStrategy,
   _source: 'global',
): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
   const warnings: string[] = [],
         promptsPath = strategy.getGlobalPromptsPath();

   if (!promptsPath) {
      return { prompts: {}, warnings };
   }

   const fullPath = join(homedir(), promptsPath);

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            };

      return strategy.parseGlobalPrompts(files, fileReader);
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read global prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { prompts: {}, warnings };
}

/**
 * Import prompts/workflows from project-local editor config.
 */
async function importLocalPrompts(
   strategy: PromptsStrategy,
   editor: EditorName,
   projectRoot: string,
): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
   const warnings: string[] = [],
         configDir = EDITOR_CONFIG_DIRS[editor],
         promptsDir = strategy.getPromptsDir(),
         fullPath = join(projectRoot, configDir, promptsDir);

   if (!strategy.isSupported()) {
      return { prompts: {}, warnings };
   }

   try {
      const files = await readdir(fullPath),
            fileReader = async (filename: string): Promise<string> => {
               return readFile(join(fullPath, filename), 'utf-8');
            };

      return strategy.parseGlobalPrompts(files, fileReader);
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read local prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { prompts: {}, warnings };
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
