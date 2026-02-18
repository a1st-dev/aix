import { describe, it, expect } from 'vitest';
import { importFromEditor, getGlobalConfigPath } from '../../editors/import.js';

describe('Editor Config Import', () => {
   describe('getGlobalConfigPath', () => {
      it('returns global path for windsurf', () => {
         const path = getGlobalConfigPath('windsurf');

         // Windsurf MCP is global-only, returns the global config path
         expect(path).toContain('windsurf');
      });

      it('returns path for cursor', () => {
         const path = getGlobalConfigPath('cursor');

         expect(path).toContain('cursor');
      });

      it('returns path for claude-code', () => {
         const path = getGlobalConfigPath('claude-code');

         expect(path).toContain('Claude');
      });

      it('returns path for copilot', () => {
         const path = getGlobalConfigPath('copilot');

         expect(path).toContain('Code');
      });

      it('returns path for zed', () => {
         const path = getGlobalConfigPath('zed');

         expect(path).toMatch(/[Zz]ed/);
      });

      it('returns global path for codex', () => {
         const path = getGlobalConfigPath('codex');

         // Codex MCP is global-only, returns the global config path
         expect(path).toContain('codex');
      });
   });

   describe('importFromEditor', () => {
      it('returns empty result with warning when config not found', async () => {
         // This test will fail to find the config file (unless the editor is installed)
         // and should return warnings
         const result = await importFromEditor('windsurf');

         expect(result).toHaveProperty('mcp');
         expect(result).toHaveProperty('rules');
         expect(result).toHaveProperty('warnings');
         expect(Array.isArray(result.warnings)).toBe(true);
      });

      it('imports MCP from copilot if config exists', async () => {
         const result = await importFromEditor('copilot');

         // GitHub Copilot supports MCP - result depends on whether config file exists
         expect(result).toHaveProperty('mcp');
         expect(typeof result.mcp).toBe('object');
      });
   });

});
