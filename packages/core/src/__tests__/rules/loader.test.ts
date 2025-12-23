import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { loadRule, loadRules } from '../../rules/loader.js';
import { safeRm } from '../../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-rules-loader');

describe('loadRule', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('loads rule object with inline content', async () => {
      const result = await loadRule(
         'ts-strict',
         {
            content: 'Always use strict TypeScript',
            activation: 'always',
         },
         testDir,
      );

      expect(result.content).toBe('Always use strict TypeScript');
      expect(result.source).toBe('inline');
      expect(result.name).toBe('ts-strict');
      expect(result.metadata.activation).toBe('always');
   });

   it('loads rule from local file', async () => {
      const rulesDir = join(testDir, 'rules');

      await mkdir(rulesDir, { recursive: true });
      await writeFile(join(rulesDir, 'style.md'), '# Code Style\n\nUse 2-space indentation.');

      const configPath = join(testDir, 'ai.json');
      const result = await loadRule('style', { path: './rules/style.md' }, configPath);

      expect(result.content).toBe('# Code Style\n\nUse 2-space indentation.');
      expect(result.source).toBe('file');
      expect(result.sourcePath).toContain('style.md');
   });

   it('loads rule with auto activation and description', async () => {
      const result = await loadRule(
         'react-patterns',
         {
            description: 'React component best practices',
            activation: 'auto',
            content: 'Use functional components with hooks',
         },
         testDir,
      );

      expect(result.metadata.activation).toBe('auto');
      expect(result.metadata.description).toBe('React component best practices');
   });

   it('loads rule with glob activation', async () => {
      const result = await loadRule(
         'api-rules',
         {
            activation: 'glob',
            globs: ['src/api/**/*.ts'],
            content: 'All API endpoints must include input validation',
         },
         testDir,
      );

      expect(result.metadata.activation).toBe('glob');
      expect(result.metadata.globs).toEqual(['src/api/**/*.ts']);
   });

   it('loads rule with manual activation', async () => {
      const result = await loadRule(
         'refactoring',
         {
            activation: 'manual',
            content: 'Refactoring guidelines',
         },
         testDir,
      );

      expect(result.metadata.activation).toBe('manual');
      expect(result.name).toBe('refactoring');
   });

   it('throws for rule with no content source', async () => {
      await expect(loadRule('empty', {} as never, testDir)).rejects.toThrow('no content source');
   });
});

describe('loadRules', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('loads multiple rules', async () => {
      const rules = {
         typescript: { content: 'Use TypeScript' },
         commits: { content: 'Follow conventional commits', activation: 'always' as const },
      };

      const results = await loadRules(rules, testDir);

      expect(Object.keys(results)).toHaveLength(2);
      expect(results.typescript?.content).toBe('Use TypeScript');
      expect(results.commits?.content).toBe('Follow conventional commits');
   });
});
