import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';

/**
 * Configuration for global-only MCP strategy.
 */
export interface GlobalMcpConfig {
   /** Editor name (e.g., 'windsurf', 'codex') */
   editor: string;
   /** Path to global config file relative to home directory */
   globalConfigPath: string;
   /** Config file format */
   format: 'json' | 'toml';
   /** Function to format MCP config for this editor's format */
   formatFn: (mcp: Record<string, McpServerConfig>) => string;
   /** Function to parse existing global config */
   parseFn: (content: string) => { mcp: Record<string, McpServerConfig>; warnings: string[] };
}

/**
 * MCP strategy for editors that only support global MCP configuration (Windsurf, Codex).
 * This strategy marks MCP as supported but global-only, allowing the install flow to handle
 * global config management with user confirmation.
 */
export class GlobalMcpStrategy implements McpStrategy {
   private readonly config: GlobalMcpConfig;

   constructor(config: GlobalMcpConfig) {
      this.config = config;
   }

   /**
    * Returns true because MCP IS supported, just globally. The install flow checks
    * isGlobalOnly() to determine if special handling is needed.
    */
   isSupported(): boolean {
      return true;
   }

   /**
    * Returns true to indicate this editor only supports global MCP config.
    */
   isGlobalOnly(): boolean {
      return true;
   }

   /**
    * Returns empty string since there's no project-level config path.
    */
   getConfigPath(): string {
      return '';
   }

   /**
    * Returns the global config path relative to home directory.
    */
   getGlobalMcpConfigPath(): string {
      return this.config.globalConfigPath;
   }

   /**
    * Get the absolute path to the global config file.
    */
   getAbsoluteGlobalPath(): string {
      return join(homedir(), this.config.globalConfigPath);
   }

   /**
    * Format MCP config for this editor.
    */
   formatConfig(mcp: Record<string, McpServerConfig>): string {
      return this.config.formatFn(mcp);
   }

   /**
    * Parse existing global MCP config.
    */
   parseGlobalMcpConfig(content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      return this.config.parseFn(content);
   }

   /**
    * Read the current global config file.
    */
   async readGlobalConfig(): Promise<{
      exists: boolean;
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   }> {
      const globalPath = this.getAbsoluteGlobalPath();

      if (!existsSync(globalPath)) {
         return { exists: false, mcp: {}, warnings: [] };
      }

      try {
         const content = await readFile(globalPath, 'utf-8'),
               { mcp, warnings } = this.parseGlobalMcpConfig(content);

         return { exists: true, mcp, warnings };
      } catch (error) {
         return {
            exists: true,
            mcp: {},
            warnings: [`Failed to read global config: ${(error as Error).message}`],
         };
      }
   }

   /**
    * Get the editor name for this strategy.
    */
   getEditor(): string {
      return this.config.editor;
   }
}
