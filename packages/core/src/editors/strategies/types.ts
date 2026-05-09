import type { McpServerConfig, ParsedSkill, HooksConfig, ActivationMode } from '@a1st/aix-schema';
import type { EditorPrompt, EditorRule, FileChange } from '../types.js';
import type { NamedRule } from '../../import-writer.js';

/**
 * Result of parsing editor-specific frontmatter for rules.
 */
export interface ParsedRuleFrontmatter {
   /** Content without front-matter */
   content: string;
   /** Extracted metadata from front-matter */
   metadata: {
      activation?: ActivationMode;
      description?: string;
      globs?: string[];
   };
   /** Raw frontmatter fields for round-tripping unknown fields */
   rawFrontmatter?: Record<string, unknown>;
}

/**
 * Result of parsing editor-specific frontmatter for prompts.
 */
export interface ParsedPromptFrontmatter {
   /** Content without front-matter */
   content: string;
   /** Description extracted from frontmatter */
   description?: string;
   /** Argument hint extracted from frontmatter */
   argumentHint?: string;
   /** Raw frontmatter fields for round-tripping unknown fields */
   rawFrontmatter?: Record<string, unknown>;
}

/**
 * Supported import scopes for editor-owned config.
 */
export type EditorImportScope = 'project' | 'user';

/**
 * Result shape for rule imports.
 */
export interface ImportedRulesResult {
   rules: NamedRule[];
   paths: Record<string, string>;
   scopes: Record<string, EditorImportScope>;
   warnings: string[];
}

/**
 * Result shape for prompt imports.
 */
export interface ImportedPromptsResult {
   prompts: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, EditorImportScope>;
   warnings: string[];
}

/**
 * Result shape for skill imports.
 */
export interface ImportedSkillsResult {
   skills: Record<string, string>;
   paths: Record<string, string>;
   scopes: Record<string, EditorImportScope>;
   warnings: string[];
}

/**
 * Result shape for hook imports.
 */
export interface ParsedHooksImportResult {
   hooks: HooksConfig;
   warnings: string[];
}

/**
 * Strategy for formatting and writing rules to an editor. Each editor has different rule file
 * formats and activation mode syntax.
 */
export interface RulesStrategy {
   /** Format a single rule for this editor, including any frontmatter */
   formatRule(rule: EditorRule): string;

   /** Get the rules directory path relative to the editor config dir (e.g., 'rules') */
   getRulesDir(): string;

   /** Get the file extension for rule files (e.g., '.md', '.mdc') */
   getFileExtension(): string;

   /** Get the global rules path relative to home directory, or null if not supported */
   getGlobalRulesPath(): string | null;

   /** Get extra global rule directories relative to home directory, if any. */
   getGlobalRuleImportDirs?(): readonly string[];

   /** Parse rules from file content. Returns array of rule strings. */
   parseGlobalRules(content: string): { rules: string[]; warnings: string[] };

   /** Override global rule import for editors with non-standard layouts. */
   importGlobalRules?(): Promise<ImportedRulesResult>;

   /** Override project rule import for editors with non-standard layouts. */
   importProjectRules?(projectRoot: string, editorConfigDir: string): Promise<ImportedRulesResult>;

   /** Detect if raw content appears to be in this editor's frontmatter format */
   detectFormat?(content: string): boolean;

   /** Parse editor-specific frontmatter into unified LoadedRule metadata */
   parseFrontmatter?(content: string): ParsedRuleFrontmatter;
}

/**
 * Strategy for formatting and writing MCP configuration to an editor. Each editor has different
 * MCP config file locations and JSON structures.
 */
export interface McpStrategy {
   /** Whether this editor supports MCP */
   isSupported(): boolean;

   /**
    * Whether this editor only supports global MCP config (no project-level config).
    * If true, the install flow will handle global config management with user confirmation.
    */
   isGlobalOnly?(): boolean;

   /** Format MCP config for this editor */
   formatConfig(mcp: Record<string, McpServerConfig>): string;

   /**
    * Get the MCP config file path. By default this is relative to the editor config dir (e.g.,
    * `'mcp.json'` → `{configDir}/mcp.json`). When {@link isProjectRootConfig} returns `true`, the
    * path is relative to the project root instead (e.g., `'.mcp.json'` → `{projectRoot}/.mcp.json`).
    */
   getConfigPath(): string;

   /**
    * Whether the MCP config file lives at the project root rather than inside the editor config
    * dir. Defaults to `false` when not implemented. Claude Code uses this because it reads
    * `.mcp.json` from the project root, not from `.claude/`.
    */
   isProjectRootConfig?(): boolean;

   /** Get the global MCP config path relative to home directory, or null if not supported */
   getGlobalMcpConfigPath(): string | null;

   /** Get candidate global import paths, ordered by preference. */
   getGlobalImportPaths?(): readonly string[];

   /** Get candidate project import paths, ordered by preference. */
   getProjectImportPaths?(projectRoot: string, editorConfigDir: string): readonly string[];

   /** Parse MCP config from file content */
   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   };
}

/**
 * Strategy for installing skills to an editor. Editors with native Agent Skills support use
 * symlinks, while others use pointer rules.
 */
export interface SkillsStrategy {
   /**
    * Install skills to the project. All strategies copy skills to `.aix/skills/{name}/` as the
    * source of truth. Native strategies also create symlinks; pointer strategies generate rules.
    *
    * @returns File changes for skill directories and any symlinks created
    */
   installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean; targetScope?: 'project' | 'user' },
   ): Promise<FileChange[]>;

   /**
    * Generate pointer rules for installed skills. Native strategies return empty array since the
    * editor reads skills directly.
    */
   generateSkillRules(
      skills: Map<string, ParsedSkill>,
      options?: { targetScope?: 'project' | 'user' },
   ): EditorRule[];

   /** Get the central skills directory path relative to project root */
   getSkillsDir(): string;

   /** Get project-local skill directories relative to the project root. */
   getProjectImportDirs(): readonly string[];

   /** Get user-level skill directories relative to the home directory. */
   getGlobalImportDirs(): readonly string[];

   /** Whether this strategy uses native Agent Skills support (symlinks) or pointer rules */
   isNative(): boolean;
}

/**
 * Configuration for creating a skills strategy
 */
export interface NativeSkillsConfig {
   /** The editor's project-level native skills directory (e.g., '.claude/skills' or '.github/skills') */
   editorSkillsDir: string;
   /** Optional user-level native skills directory when it differs from the project-level path. */
   userEditorSkillsDir?: string;
}

/**
 * Strategy for formatting and writing prompts/commands to an editor. Each editor has different
 * prompt file formats, locations, and frontmatter fields.
 */
export interface PromptsStrategy {
   /** Whether this editor supports prompts/commands */
   isSupported(): boolean;

   /**
    * Whether this editor only supports global prompts (no project-level config).
    * If true, the install flow will handle global config management with user confirmation.
    */
   isGlobalOnly?(): boolean;

   /** Format a single prompt for this editor, including any frontmatter */
   formatPrompt(prompt: EditorPrompt): string;

   /** Get the prompts directory path relative to the editor config dir (e.g., 'commands') */
   getPromptsDir(): string;

   /** Get the file extension for prompt files (e.g., '.md', '.prompt.md') */
   getFileExtension(): string;

   /** Get the global prompts directory path relative to home directory, or null if not supported */
   getGlobalPromptsPath(): string | null;

   /** Override global prompt import for editors with non-standard layouts. */
   importGlobalPrompts?(): Promise<ImportedPromptsResult>;

   /** Override project prompt import for editors with non-standard layouts. */
   importProjectPrompts?(projectRoot: string, editorConfigDir: string): Promise<ImportedPromptsResult>;

   /**
    * Parse prompts from directory. Receives file list and reader function.
    * Returns map of prompt name to content.
    */
   parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }>;

   /** Detect if raw content appears to be in this editor's frontmatter format */
   detectFormat?(content: string): boolean;

   /** Parse editor-specific frontmatter into unified LoadedPrompt fields */
   parseFrontmatter?(content: string): ParsedPromptFrontmatter;
}

/**
 * Strategy for formatting and writing hooks to an editor. Each editor has different hook event
 * names, config file locations, and JSON structures.
 */
export interface HooksStrategy {
   /** Whether this editor supports hooks */
   isSupported(): boolean;

   /**
    * Format hooks config for this editor, translating generic event names to editor-specific names.
    * Returns the formatted JSON string ready to be written to the config file.
    */
   formatConfig(hooks: HooksConfig): string;

   /** Get the hooks config file path relative to the editor config dir (e.g., 'settings.json') */
   getConfigPath(): string;

   /** Get the global hooks config path relative to home directory, or null if not supported */
   getGlobalConfigPath(): string | null;

   /**
    * Get the list of hook events that this editor does NOT support.
    * Used to warn users when they configure hooks that won't work for a particular editor.
    */
   getUnsupportedEvents(hooks: HooksConfig): string[];

   /**
    * Get per-action lists of fields that this editor does not surface natively. Adapters
    * use this so the install command can warn the user that, for example, `show_output`
    * was dropped on Claude Code. Returns an empty array when every field is supported.
    */
   getUnsupportedFields(hooks: HooksConfig): UnsupportedHookField[];

   /**
    * Get the aix event names this strategy can translate. The support matrix uses this
    * to detect drift between `editor-support.ts` and the live strategy.
    */
   getSupportedEvents(): readonly string[];

   /**
    * Get the editor's native event names that this strategy emits, deduplicated. The
    * support matrix uses this to enforce that `supportedValues` matches the strategy.
    */
   getNativeEventNames(): readonly string[];

   /** Parse an editor-native hook config into generic aix hooks. */
   parseImportedConfig(content: string): ParsedHooksImportResult;
}

/**
 * A per-action description of fields the target editor cannot express natively.
 */
export interface UnsupportedHookField {
   event: string;
   matcherIndex: number;
   actionIndex: number;
   fields: string[];
}

/**
 * Public strategy bundle exposed by adapters so import/export flows share the same editor wiring.
 */
export interface EditorStrategyBundle {
   configDir: string;
   mcpStrategy: McpStrategy;
   rulesStrategy: RulesStrategy;
   skillsStrategy: SkillsStrategy;
   promptsStrategy: PromptsStrategy;
   hooksStrategy: HooksStrategy;
}
