import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'pathe';
import { existsSync } from 'node:fs';
import {
   writeImportedContent,
   commitImport,
   rollbackImport,
   localizeRemoteConfig,
   convertToGitReferences,
} from '../import-writer.js';
import type { GitSourceInfo } from '../remote-loader.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.cwd(), 'test-fixtures', 'import-writer');

describe('import-writer', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   describe('writeImportedContent', () => {
      it('writes rules to staging directory', async () => {
         const content = {
            rules: ['# Rule 1\nBe nice.', '# Rule 2\nBe thorough.'],
            prompts: {},
         };

         await writeImportedContent(testDir, content);

         const stagingRulesDir = join(testDir, '.aix', '.tmp', 'import-staging', 'rules'),
               files = await readdir(stagingRulesDir);

         expect(files).toHaveLength(2);
         expect(files).toContain('imported-rule-1.md');
         expect(files).toContain('imported-rule-2.md');

         const rule1Content = await readFile(join(stagingRulesDir, 'imported-rule-1.md'), 'utf-8');

         expect(rule1Content).toBe('# Rule 1\nBe nice.');
      });

      it('writes prompts to staging directory with original names', async () => {
         const content = {
            rules: [],
            prompts: {
               'code-review': '# Code Review\nReview the code.',
               'plan': '# Plan\nCreate a plan.',
            },
         };

         await writeImportedContent(testDir, content);

         const stagingPromptsDir = join(testDir, '.aix', '.tmp', 'import-staging', 'prompts'),
               files = await readdir(stagingPromptsDir);

         expect(files).toHaveLength(2);
         expect(files).toContain('code-review.md');
         expect(files).toContain('plan.md');

         const reviewContent = await readFile(join(stagingPromptsDir, 'code-review.md'), 'utf-8');

         expect(reviewContent).toBe('# Code Review\nReview the code.');
      });

      it('returns correct path references pointing to final location', async () => {
         const content = {
            rules: ['# Rule 1'],
            prompts: { 'my-prompt': '# Prompt' },
         };

         const result = await writeImportedContent(testDir, content);

         expect(result.rules['imported-rule-1']).toBe('./.aix/imported/rules/imported-rule-1.md');
         expect(result.prompts['my-prompt']).toBe('./.aix/imported/prompts/my-prompt.md');
      });

      it('handles empty import result', async () => {
         const content = { rules: [], prompts: {} };

         const result = await writeImportedContent(testDir, content);

         expect(result.rules).toEqual({});
         expect(result.prompts).toEqual({});

         // Directories should still be created
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging', 'rules'))).toBe(true);
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging', 'prompts'))).toBe(true);
      });

      it('cleans existing staging before writing', async () => {
         // Create existing staging content
         const stagingDir = join(testDir, '.aix', '.tmp', 'import-staging', 'rules');

         await mkdir(stagingDir, { recursive: true });
         await writeFile(join(stagingDir, 'old-file.md'), 'old content', 'utf-8');

         const content = { rules: ['# New Rule'], prompts: {} };

         await writeImportedContent(testDir, content);

         const files = await readdir(stagingDir);

         expect(files).toHaveLength(1);
         expect(files).toContain('imported-rule-1.md');
         expect(files).not.toContain('old-file.md');
      });
   });

   describe('commitImport', () => {
      it('moves staging to final location', async () => {
         const content = { rules: ['# Rule'], prompts: { 'test': '# Test' } };

         await writeImportedContent(testDir, content);
         await commitImport(testDir);

         // Final location should have files
         const finalRulesDir = join(testDir, '.aix', 'imported', 'rules'),
               finalPromptsDir = join(testDir, '.aix', 'imported', 'prompts');

         expect(existsSync(finalRulesDir)).toBe(true);
         expect(existsSync(finalPromptsDir)).toBe(true);

         const ruleFiles = await readdir(finalRulesDir);

         expect(ruleFiles).toContain('imported-rule-1.md');

         // Staging should be cleaned up
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging'))).toBe(false);
      });

      it('backs up and replaces existing import', async () => {
         // Create existing import
         const existingDir = join(testDir, '.aix', 'imported', 'rules');

         await mkdir(existingDir, { recursive: true });
         await writeFile(join(existingDir, 'old-rule.md'), '# Old Rule', 'utf-8');

         // Stage new import
         const content = { rules: ['# New Rule'], prompts: {} };

         await writeImportedContent(testDir, content);
         await commitImport(testDir);

         // Final location should have new files only
         const files = await readdir(existingDir);

         expect(files).toHaveLength(1);
         expect(files).toContain('imported-rule-1.md');
         expect(files).not.toContain('old-rule.md');

         // Backup should be cleaned up
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-backup'))).toBe(false);
      });
   });

   describe('rollbackImport', () => {
      it('cleans up staging directory', async () => {
         const content = { rules: ['# Rule'], prompts: {} };

         await writeImportedContent(testDir, content);

         // Verify staging exists
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging'))).toBe(true);

         await rollbackImport(testDir);

         // Staging should be cleaned up
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging'))).toBe(false);
      });

      it('restores backup if exists', async () => {
         // Create existing import
         const existingDir = join(testDir, '.aix', 'imported', 'rules');

         await mkdir(existingDir, { recursive: true });
         await writeFile(join(existingDir, 'original-rule.md'), '# Original Rule', 'utf-8');

         // Stage new import
         const content = { rules: ['# New Rule'], prompts: {} };

         await writeImportedContent(testDir, content);

         // Manually move existing to backup (simulating partial commit failure)
         const backupDir = join(testDir, '.aix', '.tmp', 'import-backup');

         await mkdir(backupDir, { recursive: true });

         const { rename } = await import('node:fs/promises');

         await rename(join(testDir, '.aix', 'imported'), backupDir);

         // Rollback should restore backup
         await rollbackImport(testDir);

         // Original should be restored
         const files = await readdir(existingDir);

         expect(files).toContain('original-rule.md');

         const restoredContent = await readFile(join(existingDir, 'original-rule.md'), 'utf-8');

         expect(restoredContent).toBe('# Original Rule');
      });

      it('handles rollback when no backup exists', async () => {
         const content = { rules: ['# Rule'], prompts: {} };

         await writeImportedContent(testDir, content);

         // Rollback without any existing import
         await rollbackImport(testDir);

         // Should not throw, staging should be cleaned
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging'))).toBe(false);
         expect(existsSync(join(testDir, '.aix', 'imported'))).toBe(false);
      });
   });

   describe('sanitizeFileName', () => {
      it('sanitizes prompt names with special characters', async () => {
         const content = {
            rules: [],
            prompts: {
               'Code Review!!!': '# Review',
               'my_prompt_name': '# Prompt',
               'UPPERCASE': '# Upper',
            },
         };

         const result = await writeImportedContent(testDir, content);

         expect(result.prompts['Code Review!!!']).toBe('./.aix/imported/prompts/code-review.md');
         expect(result.prompts['my_prompt_name']).toBe('./.aix/imported/prompts/my-prompt-name.md');
         expect(result.prompts['UPPERCASE']).toBe('./.aix/imported/prompts/uppercase.md');
      });
   });

   describe('localizeRemoteConfig', () => {
      it('copies rules with relative paths and updates config', async () => {
         // Create a "remote" directory with rule files
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'rules'), { recursive: true });
         await writeFile(join(remoteDir, 'rules', 'general.md'), '# General Rules', 'utf-8');

         const config = {
            rules: {
               general: { path: './rules/general.md' },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         // Config should be updated with new path
         expect(result.config.rules?.general).toEqual({ path: './.aix/imported/rules/general.md' });
         expect(result.filesCopied).toBe(1);
         expect(result.warnings).toHaveLength(0);

         // File should be staged
         const stagingPath = join(testDir, '.aix', '.tmp', 'import-staging', 'rules', 'general.md');

         expect(existsSync(stagingPath)).toBe(true);

         const content = await readFile(stagingPath, 'utf-8');

         expect(content).toBe('# General Rules');
      });

      it('copies rules using string shorthand and converts to object form', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'rules'), { recursive: true });
         await writeFile(join(remoteDir, 'rules', 'style.md'), '# Style Rules', 'utf-8');

         // String shorthand form (common in real configs)
         const config = {
            rules: {
               style: './rules/style.md',
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         // Should be converted to object form with updated path
         expect(result.config.rules?.style).toEqual({ path: './.aix/imported/rules/style.md' });
         expect(result.filesCopied).toBe(1);
      });

      it('copies prompts with relative paths and updates config', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'prompts'), { recursive: true });
         await writeFile(join(remoteDir, 'prompts', 'review.md'), '# Code Review Prompt', 'utf-8');

         const config = {
            prompts: {
               'code-review': { path: './prompts/review.md' },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         expect(result.config.prompts?.['code-review']).toEqual({
            path: './.aix/imported/prompts/review.md',
         });
         expect(result.filesCopied).toBe(1);
      });

      it('copies skills directories recursively', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'skills', 'npm-search'), { recursive: true });
         await writeFile(join(remoteDir, 'skills', 'npm-search', 'SKILL.md'), '# NPM Search', 'utf-8');
         await writeFile(join(remoteDir, 'skills', 'npm-search', 'search.md'), '# Search', 'utf-8');

         const config = {
            skills: {
               'npm-search': { path: './skills/npm-search/' },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         expect(result.config.skills?.['npm-search']).toEqual({
            path: './.aix/imported/skills/npm-search',
         });
         expect(result.filesCopied).toBe(1);

         // Skill files should be staged
         const stagingSkillDir = join(testDir, '.aix', '.tmp', 'import-staging', 'skills', 'npm-search');

         expect(existsSync(join(stagingSkillDir, 'SKILL.md'))).toBe(true);
         expect(existsSync(join(stagingSkillDir, 'search.md'))).toBe(true);
      });

      it('warns when source file not found', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(remoteDir, { recursive: true });

         const config = {
            rules: {
               missing: { path: './rules/missing.md' },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         expect(result.filesCopied).toBe(0);
         expect(result.warnings).toHaveLength(1);
         expect(result.warnings[0]).toContain('missing');
         expect(result.warnings[0]).toContain('source file not found');
      });

      it('ignores non-relative paths', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(remoteDir, { recursive: true });

         const config = {
            rules: {
               remote: { git: { url: 'github:org/repo' } },
               npm: { npm: { npm: '@scope/pkg', path: 'rules/style.md' } },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         expect(result.filesCopied).toBe(0);
         expect(result.warnings).toHaveLength(0);
         // Config should be unchanged
         expect(result.config.rules?.remote).toEqual({ git: { url: 'github:org/repo' } });
      });

      it('handles multiple items across rules, prompts, and skills', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'rules'), { recursive: true });
         await mkdir(join(remoteDir, 'prompts'), { recursive: true });
         await writeFile(join(remoteDir, 'rules', 'a.md'), '# A', 'utf-8');
         await writeFile(join(remoteDir, 'rules', 'b.md'), '# B', 'utf-8');
         await writeFile(join(remoteDir, 'prompts', 'p.md'), '# P', 'utf-8');

         const config = {
            rules: {
               a: { path: './rules/a.md' },
               b: { path: './rules/b.md' },
            },
            prompts: {
               p: { path: './prompts/p.md' },
            },
         };

         const result = await localizeRemoteConfig(config, remoteDir, testDir);

         expect(result.filesCopied).toBe(3);
         expect(result.config.rules?.a).toEqual({ path: './.aix/imported/rules/a.md' });
         expect(result.config.rules?.b).toEqual({ path: './.aix/imported/rules/b.md' });
         expect(result.config.prompts?.p).toEqual({ path: './.aix/imported/prompts/p.md' });
      });

      it('works with commitImport to finalize files', async () => {
         const remoteDir = join(testDir, 'remote');

         await mkdir(join(remoteDir, 'rules'), { recursive: true });
         await writeFile(join(remoteDir, 'rules', 'test.md'), '# Test', 'utf-8');

         const config = { rules: { test: { path: './rules/test.md' } } };

         await localizeRemoteConfig(config, remoteDir, testDir);
         await commitImport(testDir);

         // File should be in final location
         const finalPath = join(testDir, '.aix', 'imported', 'rules', 'test.md');

         expect(existsSync(finalPath)).toBe(true);

         // Staging should be cleaned up
         expect(existsSync(join(testDir, '.aix', '.tmp', 'import-staging'))).toBe(false);
      });
   });

   describe('convertToGitReferences', () => {
      const gitSource: GitSourceInfo = {
         provider: 'github',
         owner: 'yokuze',
         repo: 'aix-config',
         ref: 'main',
         configPath: 'ai.json',
      };

      it('converts rules with relative paths to git references', () => {
         const config = {
            rules: {
               style: './rules/style.md',
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.rules?.style).toEqual({
            git: {
               url: 'github:yokuze/aix-config',
               ref: 'main',
               path: 'rules/style.md',
            },
         });
         expect(result.convertedCount).toBe(1);
         expect(result.converted[0]).toEqual({
            name: 'style',
            type: 'rule',
            gitRef: 'github:yokuze/aix-config#main:rules/style.md',
         });
      });

      it('converts rules in object form and preserves metadata', () => {
         const config = {
            rules: {
               style: {
                  path: './rules/style.md',
                  description: 'Code style rules',
                  activation: 'auto' as const,
               },
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.rules?.style).toEqual({
            description: 'Code style rules',
            activation: 'auto',
            git: {
               url: 'github:yokuze/aix-config',
               ref: 'main',
               path: 'rules/style.md',
            },
         });
      });

      it('converts prompts with relative paths to git references', () => {
         const config = {
            prompts: {
               'code-review': './prompts/review.md',
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.prompts?.['code-review']).toEqual({
            git: {
               url: 'github:yokuze/aix-config',
               ref: 'main',
               path: 'prompts/review.md',
            },
         });
         expect(result.convertedCount).toBe(1);
      });

      it('converts skills with relative paths to git references', () => {
         const config = {
            skills: {
               'npm-search': { path: './skills/npm-search/' },
            },
         };

         const result = convertToGitReferences(config, gitSource);

         // Trailing slash is stripped (giget doesn't handle them well)
         expect(result.config.skills?.['npm-search']).toEqual({
            git: 'github:yokuze/aix-config',
            ref: 'main',
            path: 'skills/npm-search',
         });
         expect(result.convertedCount).toBe(1);
      });

      it('preserves inline content (does not convert)', () => {
         const config = {
            rules: {
               inline: { content: '# Inline Rule\nBe nice.' },
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.rules?.inline).toEqual({ content: '# Inline Rule\nBe nice.' });
         expect(result.convertedCount).toBe(0);
      });

      it('preserves existing git references', () => {
         const config = {
            rules: {
               existing: {
                  git: {
                     url: 'github:other/repo',
                     ref: 'v1.0.0',
                     path: 'rules/other.md',
                  },
               },
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.rules?.existing).toEqual({
            git: {
               url: 'github:other/repo',
               ref: 'v1.0.0',
               path: 'rules/other.md',
            },
         });
         expect(result.convertedCount).toBe(0);
      });

      it('preserves existing npm references', () => {
         const config = {
            rules: {
               'npm-rule': {
                  npm: {
                     npm: '@company/rules',
                     path: 'rules/style.md',
                  },
               },
            },
         };

         const result = convertToGitReferences(config, gitSource);

         expect(result.config.rules?.['npm-rule']).toEqual({
            npm: {
               npm: '@company/rules',
               path: 'rules/style.md',
            },
         });
         expect(result.convertedCount).toBe(0);
      });

      it('computes correct path when config is in subdirectory', () => {
         const nestedGitSource: GitSourceInfo = {
            provider: 'github',
            owner: 'org',
            repo: 'repo',
            ref: 'main',
            configPath: 'configs/team/ai.json',
         };

         const config = {
            rules: {
               style: './rules/style.md',
            },
         };

         const result = convertToGitReferences(config, nestedGitSource);

         expect(result.config.rules?.style).toEqual({
            git: {
               url: 'github:org/repo',
               ref: 'main',
               path: 'configs/team/rules/style.md',
            },
         });
      });

      it('handles mixed sources correctly', () => {
         const config = {
            rules: {
               local: './rules/local.md',
               inline: { content: '# Inline' },
               remote: { git: { url: 'github:other/repo', path: 'r.md' } },
            },
            prompts: {
               'local-prompt': './prompts/local.md',
            },
         };

         const result = convertToGitReferences(config, gitSource);

         // Only local paths should be converted
         expect(result.convertedCount).toBe(2);
         expect(result.config.rules?.local).toHaveProperty('git');
         expect(result.config.rules?.inline).toEqual({ content: '# Inline' });
         expect(result.config.rules?.remote).toEqual({ git: { url: 'github:other/repo', path: 'r.md' } });
         expect(result.config.prompts?.['local-prompt']).toHaveProperty('git');
      });

      it('omits ref when not provided in git source', () => {
         const noRefGitSource: GitSourceInfo = {
            provider: 'gitlab',
            owner: 'group',
            repo: 'project',
            configPath: 'ai.json',
         };

         const config = {
            rules: {
               style: './rules/style.md',
            },
         };

         const result = convertToGitReferences(config, noRefGitSource);

         expect(result.config.rules?.style).toEqual({
            git: {
               url: 'gitlab:group/project',
               path: 'rules/style.md',
            },
         });
         // No ref property should be present
         const styleRule = result.config.rules?.style as { git: { ref?: string } } | undefined;

         expect(styleRule?.git.ref).toBeUndefined();
      });

      it('handles bitbucket provider', () => {
         const bbGitSource: GitSourceInfo = {
            provider: 'bitbucket',
            owner: 'workspace',
            repo: 'repo',
            ref: 'develop',
            configPath: 'ai.json',
         };

         const config = {
            rules: {
               style: './rules/style.md',
            },
         };

         const result = convertToGitReferences(config, bbGitSource);

         expect(result.config.rules?.style).toEqual({
            git: {
               url: 'bitbucket:workspace/repo',
               ref: 'develop',
               path: 'rules/style.md',
            },
         });
      });
   });
});
