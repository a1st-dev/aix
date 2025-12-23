import type { AiJsonConfig, McpServerConfig, HooksConfig } from '@a1st/aix-schema';
import type { ConfigScope } from '../merge.js';

/**
 * Describes features in ai.json that won't be applied to an editor because the editor doesn't
 * support them.
 */
export interface UnsupportedFeatures {
   /** MCP servers that won't be configured (editor doesn't support MCP) */
   mcp?: {
      reason: string;
      servers: string[];
   };
   /** Hooks that won't be configured */
   hooks?: {
      reason: string;
      /** If editor supports hooks but not all events, lists unsupported events */
      unsupportedEvents?: string[];
      /** If editor doesn't support hooks at all, true */
      allUnsupported?: boolean;
   };
   /** Prompts that won't be configured (editor doesn't support prompts) */
   prompts?: {
      reason: string;
      prompts: string[];
   };
}

export type EditorName = 'windsurf' | 'cursor' | 'claude-code' | 'vscode' | 'zed' | 'codex';

/**
 * Editor-specific rule format after translation from ai.json rules.
 */
export interface EditorRule {
   name?: string;
   content: string;
   activation: {
      type: 'always' | 'auto' | 'glob' | 'manual';
      description?: string;
      globs?: string[];
   };
   /** Source path for deriving filename (e.g., git URL with path, local file path) */
   sourcePath?: string;
}

/**
 * Editor-specific prompt/command format after translation from ai.json prompts.
 */
export interface EditorPrompt {
   name: string;
   content: string;
   description?: string;
   argumentHint?: string;
   /** Source path for deriving filename (e.g., git URL with path, local file path) */
   sourcePath?: string;
}

/**
 * Generated configuration for an editor, ready to be written to disk.
 */
export interface EditorConfig {
   rules: EditorRule[];
   prompts: EditorPrompt[];
   mcp: Record<string, McpServerConfig>;
   hooks?: HooksConfig;
}

/**
 * Options for applying editor configuration.
 */
export interface ApplyOptions {
   dryRun?: boolean;
   scopes?: ConfigScope[];
   /**
    * If true, overwrite existing JSON config files entirely instead of merging. Default is false,
    * which means JSON files in editor config folders are recursively merged with existing content.
    * Markdown files are always overwritten regardless of this setting.
    */
   overwrite?: boolean;
   /**
    * If true, skip all global configuration changes (for editors with global-only features).
    * Useful in CI environments or when user doesn't want to modify global config.
    */
   skipGlobal?: boolean;
   /**
    * If true, automatically confirm global changes without prompting.
    * Used for testing or non-interactive environments.
    */
   autoConfirmGlobal?: boolean;
   /**
    * If true, remove the .aix folder before installing to ensure a clean state.
    * This ensures the folder contents exactly match what ai.json declares.
    */
   clean?: boolean;
}

/**
 * Category of a file change for display grouping.
 */
export type FileChangeCategory = 'skill' | 'rule' | 'workflow' | 'mcp' | 'hook' | 'other';

/**
 * A single file operation to be performed.
 */
export interface FileChange {
   path: string;
   action: 'create' | 'update' | 'delete' | 'unchanged';
   content?: string;
   /** If true, this change represents a directory that was already copied (e.g., skills) */
   isDirectory?: boolean;
   /** File mode (permissions) to set, e.g., 0o755 for executable scripts */
   mode?: number;
   /** Category for display grouping */
   category?: FileChangeCategory;
}

/**
 * Information about global configuration changes.
 */
export interface GlobalChangesInfo {
   /** Global changes that were applied */
   applied: Array<{ type: 'mcp' | 'prompt'; name: string; globalPath: string }>;
   /** Global changes that were skipped */
   skipped: Array<{ type: 'mcp' | 'prompt'; name: string; reason: string }>;
   /** Warnings from global change processing */
   warnings: string[];
}

/**
 * Result of applying editor configuration.
 */
export interface ApplyResult {
   editor: EditorName;
   success: boolean;
   changes: FileChange[];
   errors: string[];
   /** Features that were skipped because the editor doesn't support them */
   unsupportedFeatures?: UnsupportedFeatures;
   /** Information about global configuration changes (for global-only features) */
   globalChanges?: GlobalChangesInfo;
}

/**
 * Interface for editor-specific adapters. Each supported editor implements this interface to
 * translate ai.json configuration into editor-native formats.
 */
export interface EditorAdapter {
   readonly name: EditorName;
   readonly configDir: string;

   /**
    * Check if this editor's config directory exists in the project.
    */
   detect(projectRoot: string): Promise<boolean>;

   /**
    * Generate editor-specific configuration from ai.json config.
    */
   generateConfig(
      config: AiJsonConfig,
      projectRoot: string,
      options?: ApplyOptions,
   ): Promise<EditorConfig>;

   /**
    * Apply the generated configuration to the editor's config files.
    */
   apply(editorConfig: EditorConfig, projectRoot: string, options?: ApplyOptions): Promise<ApplyResult>;

   /**
    * Get features from the config that this editor doesn't support.
    */
   getUnsupportedFeatures(config: AiJsonConfig): UnsupportedFeatures;
}
