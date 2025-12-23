import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { mergeRules, getActiveRules } from '../../rules/merger.js';
import type { RulesConfig } from '@a1st/aix-schema';
import { safeRm } from '../../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-rules-merger');

describe('mergeRules', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('merges project rules', async () => {
      const config: RulesConfig = {
         typescript: { content: 'Use TypeScript' },
         commits: { content: 'Follow conventional commits' },
      };

      const result = await mergeRules(config, [], { basePath: join(testDir, 'ai.json') });

      expect(result.all).toHaveLength(2);
      expect(result.always).toHaveLength(2);
      expect(result.all[0]?.scope).toBe('project');
   });

   it('merges project rules in correct order', async () => {
      const config: RulesConfig = {
         preference: { content: 'My preference' },
         standard: { content: 'Project standard' },
      };

      const result = await mergeRules(config, [], { basePath: join(testDir, 'ai.json') });

      expect(result.all).toHaveLength(2);
      expect(result.all[0]?.scope).toBe('project');
      expect(result.all[1]?.scope).toBe('project');
   });

   it('includes skill rules first (lowest priority)', async () => {
      const config: RulesConfig = {
         'project-rule': { content: 'Project rule' },
      };

      const skillRules = [
         {
            name: 'skill-rule',
            content: 'Skill rule',
            source: 'file' as const,
            metadata: { activation: 'always' as const },
         },
      ];

      const result = await mergeRules(config, skillRules, { basePath: join(testDir, 'ai.json') });

      expect(result.all).toHaveLength(2);
      expect(result.all[0]?.scope).toBe('skill');
      expect(result.all[1]?.scope).toBe('project');
   });

   it('categorizes rules by activation mode', async () => {
      const config: RulesConfig = {
         'always-rule': { content: 'Always on rule' },
         'auto-rule': { content: 'Auto rule', activation: 'auto', description: 'When needed' },
         'manual-rule': { content: 'Manual rule', activation: 'manual' },
      };

      const result = await mergeRules(config, [], { basePath: join(testDir, 'ai.json') });

      expect(result.always).toHaveLength(1);
      expect(result.auto).toHaveLength(1);
      expect(result.manual).toHaveLength(1);
   });

   it('filters glob rules by target path', async () => {
      const config: RulesConfig = {
         'api-rule': { content: 'API rule', activation: 'glob', globs: ['src/api/**/*.ts'] },
         'ui-rule': { content: 'UI rule', activation: 'glob', globs: ['src/ui/**/*.tsx'] },
      };

      const result = await mergeRules(config, [], {
         basePath: join(testDir, 'ai.json'),
         targetPath: 'src/api/users.ts',
      });

      expect(result.glob).toHaveLength(1);
      expect(result.glob[0]?.content).toBe('API rule');
   });

   it('includes editor-specific rules when provided', async () => {
      const config: RulesConfig = {
         'global-rule': { content: 'Global project rule' },
      };

      const result = await mergeRules(config, [], {
         basePath: join(testDir, 'ai.json'),
         editorRules: { 'editor-rule': { content: 'Editor-specific rule' } },
      });

      expect(result.all).toHaveLength(2);
      expect(result.all.find((r) => r.scope === 'editor')).toBeDefined();
   });
});

describe('getActiveRules', () => {
   it('returns always + glob + auto rules', async () => {
      const config: RulesConfig = {
         'always-rule': { content: 'Always rule' },
         'auto-rule': { content: 'Auto rule', activation: 'auto', description: 'When needed' },
         'manual-rule': { content: 'Manual rule', activation: 'manual' },
         'glob-rule': { content: 'Glob rule', activation: 'glob', globs: ['*.ts'] },
      };

      const merged = await mergeRules(config, [], {
         basePath: join(tmpdir(), 'ai.json'),
         targetPath: 'test.ts',
      });

      const active = getActiveRules(merged);

      expect(active).toHaveLength(3); // always + auto + glob (matching)
      expect(active.find((r) => r.content === 'Manual rule')).toBeUndefined();
   });
});
