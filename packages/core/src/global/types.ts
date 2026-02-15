import type { McpServerConfig } from '@a1st/aix-schema';
import type { EditorName } from '../editors/types.js';

/**
 * A request to modify global configuration.
 */
export interface GlobalChangeRequest {
   /** Editor this change applies to */
   editor: EditorName;
   /** Type of global config */
   type: 'mcp' | 'prompt';
   /** Name of the config item (e.g., MCP server name, prompt name) */
   name: string;
   /** Action to perform */
   action: 'add' | 'skip';
   /** Reason for skipping (if action is 'skip') */
   skipReason?: string;
   /** Path to global config file */
   globalPath: string;
   /** File format for MCP config files (defaults to 'json') */
   format?: 'json' | 'toml';
   /** The new config to add (for MCP) */
   mcpConfig?: McpServerConfig;
   /** The new content to add (for prompts) */
   promptContent?: string;
   /** Existing config if it already exists */
   existingMcpConfig?: McpServerConfig;
   /** Existing content if it already exists */
   existingPromptContent?: string;
   /** Whether configs match (no action needed) */
   configsMatch?: boolean;
}

/**
 * Result of processing global changes.
 */
export interface GlobalChangeResult {
   /** Changes that were applied */
   applied: GlobalChangeRequest[];
   /** Changes that were skipped */
   skipped: GlobalChangeRequest[];
   /** Warnings generated during processing */
   warnings: string[];
}

/**
 * Options for processing global changes.
 */
export interface GlobalChangeOptions {
   /** If true, skip all global changes without prompting */
   skipGlobal?: boolean;
   /** If true, apply all global changes without prompting (for testing) */
   autoConfirm?: boolean;
   /** Project root path for tracking */
   projectPath: string;
   /** Dry run - don't actually write files */
   dryRun?: boolean;
}
