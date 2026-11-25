import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { updateConfig, updateLocalConfig } from '../updater.js';
import { ConfigNotFoundError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.env.HOME ?? '', 'test-fixtures', 'updater');

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

   it('changes only the entry the updater touched', async () => {
      const configPath = join(testDir, 'ai.json'),
            original = [
               '{',
               '   // Owned by the platform team',
               '   "x-team": { "owner": "platform" },',
               '   "editors": { "cursor": {} },',
               '   "rules": {',
               '      "style": {',
               '         "path": "./rules/style.md"',
               '      }',
               '   }',
               '}',
               '',
            ];

      await writeFile(configPath, original.join('\n'), 'utf-8');

      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         rules: { ...cfg.rules, tests: { path: './rules/tests.md' } },
      }));

      const raw = await readFile(configPath, 'utf-8');

      expect(raw).toBe([
         ...original.slice(0, 7),
         '      },',
         '      "tests": {',
         '         "path": "./rules/tests.md"',
         '      }',
         ...original.slice(8),
      ].join('\n'));
   });

   it('does not add sections the config did not have', async () => {
      const configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify({ skills: {} }, null, 2), 'utf-8');

      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         skills: { typescript: '^1.0.0' },
      }));

      const updated: unknown = JSON.parse(await readFile(configPath, 'utf-8'));

      expect(updated).toEqual({ skills: { typescript: '^1.0.0' } });
   });

   it('removes an entry the updater deleted', async () => {
      const configPath = join(testDir, 'ai.json'),
            config = { rules: { style: './rules/style.md', tests: './rules/tests.md' } };

      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      await updateConfig(configPath, (cfg) => ({
         ...cfg,
         rules: { style: './rules/style.md' },
      }));

      const updated: unknown = JSON.parse(await readFile(configPath, 'utf-8'));

      expect(updated).toEqual({ rules: { style: './rules/style.md' } });
   });
});

describe('updateConfig with a config in package.json', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('changes the ai field and leaves the rest of package.json alone', async () => {
      const packageJsonPath = join(testDir, 'package.json');

      await writeFile(packageJsonPath, JSON.stringify({ name: 'demo', version: '1.0.0', ai: { rules: {} } }, null, 2), 'utf-8');

      await updateConfig(packageJsonPath, (config) => {
         return { ...config, rules: { strict: { content: 'Use strict mode.' } } };
      });

      expect(JSON.parse(await readFile(packageJsonPath, 'utf-8'))).to.eql({
         name: 'demo',
         version: '1.0.0',
         ai: { rules: { strict: { content: 'Use strict mode.' } } },
      });
   });
});

describe('updateLocalConfig', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('writes the updated entry without the defaults validation fills in', async () => {
      const localPath = join(testDir, 'ai.local.json');

      await writeFile(localPath, JSON.stringify({ editors: { cursor: {} } }, null, 2), 'utf-8');

      await updateLocalConfig(localPath, (cfg) => ({
         ...cfg,
         skills: { pdf: './skills/pdf' },
      }), { backup: false });

      const updated: unknown = JSON.parse(await readFile(localPath, 'utf-8'));

      expect(updated).toEqual({
         editors: { cursor: {} },
         skills: { pdf: './skills/pdf' },
      });
   });

   it('creates the file with only what the updater returned', async () => {
      const localPath = join(testDir, 'ai.local.json');

      await updateLocalConfig(localPath, () => ({
         rules: { style: { content: 'Use direct language.' } },
      }));

      const created: unknown = JSON.parse(await readFile(localPath, 'utf-8'));

      expect(created).toEqual({ rules: { style: { content: 'Use direct language.' } } });
   });
});
