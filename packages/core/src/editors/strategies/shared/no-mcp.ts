import type { McpServerConfig } from '@a1st/aix-schema';
import type { McpStrategy } from '../types.js';

/**
 * No-op MCP strategy for editors that don't support MCP (e.g., VS Code with GitHub Copilot).
 */
export class NoMcpStrategy implements McpStrategy {
   isSupported(): boolean {
      return false;
   }

   getConfigPath(): string {
      return '';
   }

   getGlobalMcpConfigPath(): string | null {
      return null;
   }

   formatConfig(_mcp: Record<string, McpServerConfig>): string {
      return '';
   }

   parseGlobalMcpConfig(_content: string): {
      mcp: Record<string, McpServerConfig>;
      warnings: string[];
   } {
      return { mcp: {}, warnings: [] };
   }
}
