import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { loadPrompt, loadPrompts } from '../../prompts/loader.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('prompts/loader', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-prompts-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   describe('loadPrompt', () => {
      it('loads inline content prompt', async () => {
         const prompt = {
            content: 'Review the code for issues',
            description: 'Code review checklist',
         };

         const loaded = await loadPrompt('review', prompt, join(testDir, 'ai.json'));

         expect(loaded.name).toBe('review');
         expect(loaded.content).toBe('Review the code for issues');
         expect(loaded.description).toBe('Code review checklist');
         expect(loaded.sourcePath).toBeUndefined();
      });

      it('loads prompt from local file', async () => {
         const promptContent = '# Code Review\n\nReview the code for potential issues.';

         await writeFile(join(testDir, 'review.md'), promptContent);

         const prompt = {
            path: './review.md',
            description: 'Code review',
         };

         const loaded = await loadPrompt('review', prompt, join(testDir, 'ai.json'));

         expect(loaded.name).toBe('review');
         expect(loaded.content).toBe(promptContent);
         expect(loaded.description).toBe('Code review');
         expect(loaded.sourcePath).toBe(join(testDir, 'review.md'));
      });

      it('preserves argumentHint', async () => {
         const prompt = {
            content: 'Review $ARGUMENTS',
            argumentHint: '[file-path]',
         };

         const loaded = await loadPrompt('review', prompt, join(testDir, 'ai.json'));

         expect(loaded.argumentHint).toBe('[file-path]');
      });

      it('throws for prompt with no content source', async () => {
         const prompt = {} as never;

         await expect(loadPrompt('invalid', prompt, join(testDir, 'ai.json'))).rejects.toThrow(
            'no content source found',
         );
      });
   });

   describe('loadPrompts', () => {
      it('loads multiple prompts', async () => {
         const prompts = {
            review: { content: 'Review code' },
            refactor: { content: 'Refactor code' },
         };

         const loaded = await loadPrompts(prompts, join(testDir, 'ai.json'));

         expect(Object.keys(loaded)).toHaveLength(2);
         expect(loaded.review!.name).toBe('review');
         expect(loaded.refactor!.name).toBe('refactor');
      });

      it('returns empty object for empty input', async () => {
         const loaded = await loadPrompts({}, join(testDir, 'ai.json'));

         expect(Object.keys(loaded)).toHaveLength(0);
      });
   });
});
