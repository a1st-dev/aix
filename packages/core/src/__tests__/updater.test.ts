import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { updateConfig } from '../updater.js';
import { ConfigNotFoundError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.cwd(), 'test-fixtures', 'updater');

describe('updateConfig', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('updates config atomically', async () => {
      const config = { skills: {}, mcp: {} },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         skills: { typescript: '^1.0.0' },
      }));

      const updated = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>;

      expect(updated.skills).toEqual({ typescript: '^1.0.0' });
   });

   it('validates config before writing', async () => {
      const config = { skills: {}, mcp: {} },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      await expect(
         updateConfig(configPath, () => ({ skills: { 'INVALID-NAME': '^1.0.0' } }) as never),
      ).rejects.toThrow();
   });

   it('throws when config not found', async () => {
      const configPath = join(testDir, 'nonexistent.json');

      await expect(updateConfig(configPath, (cfg) => cfg)).rejects.toThrow(ConfigNotFoundError);
   });

   it('preserves extends and relative paths when updating', async () => {
      const config = {
               extends: 'github:yokuze/aix-config#main',
               skills: { local: './skills/my-skill' },
               editors: { windsurf: { enabled: true } },
            },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      // Update the config by adding a new editor
      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         editors: {
            ...cfg.editors,
            cursor: { enabled: true },
         },
      }));

      const updated = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>;

      // extends should be preserved exactly as-is
      expect(updated.extends).toBe('github:yokuze/aix-config#main');
      // Relative paths should remain relative
      expect(updated.skills).toEqual({ local: './skills/my-skill' });
      // The update should have been applied
      expect(updated.editors).toEqual({
         windsurf: { enabled: true },
         cursor: { enabled: true },
      });
   });

   it('preserves comments when updating config', async () => {
      const configPath = join(testDir, 'ai.json');

      await writeFile(
         configPath,
         [
            '// Project configuration for AI tools',
            '{',
            '   // Base configuration to inherit',
            '   "extends": "github:yokuze/aix-config#main",',
            '   // Configured editors',
            '   "editors": {',
            '      "windsurf": { "enabled": true }',
            '   }',
            '}',
            '',
         ].join('\n'),
         'utf-8',
      );

      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         editors: {
            ...cfg.editors,
            cursor: { enabled: true },
         },
      }));

      const raw = await readFile(configPath, 'utf-8');

      expect(raw).toContain('// Project configuration for AI tools');
      expect(raw).toContain('// Base configuration to inherit');
      expect(raw).toContain('// Configured editors');
      expect(raw).toContain('"cursor"');
   });
});
