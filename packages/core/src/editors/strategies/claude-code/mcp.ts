import { platform } from 'node:os';
import type { McpStrategy } from '../types.js';
import { StandardMcpStrategy } from '../shared/standard-mcp.js';

/**
 * Claude Code MCP strategy. Uses `mcp.json` with a `mcpServers` object.
 * Global config path is platform-specific.
 */
export class ClaudeCodeMcpStrategy extends StandardMcpStrategy implements McpStrategy {
   override getGlobalMcpConfigPath(): string | null {
      const paths: Record<string, string> = {
         darwin: 'Library/Application Support/Claude/claude_desktop_config.json',
         linux: '.config/Claude/claude_desktop_config.json',
         win32: 'AppData/Roaming/Claude/claude_desktop_config.json',
      };

      return paths[platform()] ?? null;
   }
}
