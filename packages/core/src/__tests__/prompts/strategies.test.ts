import { describe, it, expect } from 'vitest';
import type { EditorPrompt } from '../../editors/types.js';
import { ClaudeCodePromptsStrategy } from '../../editors/strategies/claude-code/prompts.js';
import { CursorPromptsStrategy } from '../../editors/strategies/cursor/prompts.js';
import { WindsurfPromptsStrategy } from '../../editors/strategies/windsurf/prompts.js';
import { VSCodePromptsStrategy } from '../../editors/strategies/vscode/prompts.js';
import { CodexPromptsStrategy } from '../../editors/strategies/codex/prompts.js';
import { ZedPromptsStrategy } from '../../editors/strategies/zed/prompts.js';
import { NoPromptsStrategy } from '../../editors/strategies/shared/no-prompts.js';

const createPrompt = (overrides: Partial<EditorPrompt> = {}): EditorPrompt => ({
   name: 'review',
   content: 'Review the code for potential issues.',
   description: 'Code review checklist',
   argumentHint: '[file-path]',
   ...overrides,
});

describe('PromptsStrategy implementations', () => {
   describe('ClaudeCodePromptsStrategy', () => {
      const strategy = new ClaudeCodePromptsStrategy();

      it('is supported', () => {
         expect(strategy.isSupported()).toBe(true);
      });

      it('returns correct prompts directory', () => {
         expect(strategy.getPromptsDir()).toBe('commands');
      });

      it('returns correct file extension', () => {
         expect(strategy.getFileExtension()).toBe('.md');
      });

      it('formats prompt with frontmatter', () => {
         const prompt = createPrompt();
         const formatted = strategy.formatPrompt(prompt);

         expect(formatted).toContain('---');
         expect(formatted).toContain('description: Code review checklist');
         expect(formatted).toContain('argument-hint: [file-path]');
         expect(formatted).toContain('Review the code for potential issues.');
      });

      it('formats prompt without frontmatter when no metadata', () => {
         const prompt = createPrompt({ description: undefined, argumentHint: undefined });
         const formatted = strategy.formatPrompt(prompt);

         expect(formatted).not.toContain('---');
         expect(formatted).toBe('Review the code for potential issues.');
      });
   });

   describe('CursorPromptsStrategy', () => {
      const strategy = new CursorPromptsStrategy();

      it('is supported', () => {
         expect(strategy.isSupported()).toBe(true);
      });

      it('returns correct prompts directory', () => {
         expect(strategy.getPromptsDir()).toBe('commands');
      });

      it('returns correct file extension', () => {
         expect(strategy.getFileExtension()).toBe('.md');
      });

      it('formats prompt as plain markdown with heading', () => {
         const prompt = createPrompt();
         const formatted = strategy.formatPrompt(prompt);

         // Cursor uses plain markdown, no frontmatter
         expect(formatted).toContain('# review');
         expect(formatted).toContain('Code review checklist');
         expect(formatted).toContain('Review the code for potential issues.');
      });
   });

   describe('WindsurfPromptsStrategy', () => {
      const strategy = new WindsurfPromptsStrategy();

      it('is supported', () => {
         expect(strategy.isSupported()).toBe(true);
      });

      it('returns correct prompts directory', () => {
         expect(strategy.getPromptsDir()).toBe('workflows');
      });

      it('returns correct file extension', () => {
         expect(strategy.getFileExtension()).toBe('.md');
      });

      it('formats prompt with frontmatter and heading', () => {
         const prompt = createPrompt();
         const formatted = strategy.formatPrompt(prompt);

         expect(formatted).toContain('---');
         expect(formatted).toContain('description: Code review checklist');
         expect(formatted).toContain('# review');
         expect(formatted).toContain('Review the code for potential issues.');
      });
   });

   describe('VSCodePromptsStrategy', () => {
      const strategy = new VSCodePromptsStrategy();

      it('is supported', () => {
         expect(strategy.isSupported()).toBe(true);
      });

      it('returns correct prompts directory', () => {
         expect(strategy.getPromptsDir()).toBe('../.github/prompts');
      });

      it('returns correct file extension', () => {
         expect(strategy.getFileExtension()).toBe('.prompt.md');
      });

      it('formats prompt with frontmatter', () => {
         const prompt = createPrompt();
         const formatted = strategy.formatPrompt(prompt);

         expect(formatted).toContain('---');
         expect(formatted).toContain('description: Code review checklist');
         expect(formatted).toContain('argument-hint: [file-path]');
         expect(formatted).toContain('Review the code for potential issues.');
      });
   });

   describe('CodexPromptsStrategy', () => {
      const strategy = new CodexPromptsStrategy();

      it('is supported but global-only', () => {
         // Codex prompts are global-only (~/.codex/prompts/), but still supported
         expect(strategy.isSupported()).toBe(true);
         expect(strategy.isGlobalOnly()).toBe(true);
      });

      it('returns empty prompts directory (no project-level path)', () => {
         expect(strategy.getPromptsDir()).toBe('');
      });

      it('returns .md file extension for global prompts', () => {
         expect(strategy.getFileExtension()).toBe('.md');
      });

      it('returns global prompts path', () => {
         expect(strategy.getGlobalPromptsPath()).toBe('.codex/prompts');
      });
   });

   describe('ZedPromptsStrategy', () => {
      it('behaves identically to NoPromptsStrategy', () => {
         const zed = new ZedPromptsStrategy();
         const no = new NoPromptsStrategy();
         const prompt = createPrompt();

         expect(zed.isSupported()).toBe(no.isSupported());
         expect(zed.getPromptsDir()).toBe(no.getPromptsDir());
         expect(zed.getFileExtension()).toBe(no.getFileExtension());
         expect(zed.formatPrompt(prompt)).toBe(no.formatPrompt(prompt));
      });
   });

   describe('NoPromptsStrategy', () => {
      const strategy = new NoPromptsStrategy();

      it('is not supported', () => {
         expect(strategy.isSupported()).toBe(false);
      });

      it('returns empty prompts directory', () => {
         expect(strategy.getPromptsDir()).toBe('');
      });

      it('returns empty file extension', () => {
         expect(strategy.getFileExtension()).toBe('');
      });

      it('returns empty string for formatted prompt', () => {
         const prompt = createPrompt();

         expect(strategy.formatPrompt(prompt)).toBe('');
      });
   });
});
