import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

      it('imports Zed project rules with a display name and path', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-zed-rules-'));

         try {
            const rulesPath = join(projectRoot, '.rules');

            await writeFile(rulesPath, 'Use short names.', 'utf-8');

            const result = await importFromEditor('zed', { projectRoot });

            expect(result.rules).toEqual([{
               name: 'project rules',
               content: 'Use short names.',
               path: rulesPath,
               scope: 'project',
            }]);
            expect(result.paths.rules['project rules']).toBe(rulesPath);
            expect(result.scopes.rules['project rules']).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });

      it('imports project skills from editor skill directories', async () => {
         const projectRoot = await mkdtemp(join(tmpdir(), 'aix-codex-skills-'));

         try {
            const skillPath = join(projectRoot, '.agents', 'skills', 'typescript');

            await mkdir(skillPath, { recursive: true });
            await writeFile(join(skillPath, 'SKILL.md'), '# TypeScript', 'utf-8');

            const result = await importFromEditor('codex', { projectRoot });

            expect(result.skills.typescript).toBe(skillPath);
            expect(result.paths.skills.typescript).toBe(skillPath);
            expect(result.scopes.skills.typescript).toBe('project');
         } finally {
            await rm(projectRoot, { recursive: true, force: true });
         }
      });
   });

});
