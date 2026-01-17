import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'pathe';
import { existsSync } from 'node:fs';
import { writeImportedContent, commitImport, rollbackImport } from '../import-writer.js';
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
});
