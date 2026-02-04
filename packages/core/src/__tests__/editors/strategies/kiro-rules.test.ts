import { describe, it, expect } from 'vitest';
import { KiroRulesStrategy } from '../../../editors/strategies/kiro/rules.js';
import type { EditorRule } from '../../../editors/types.js';

describe('KiroRulesStrategy', () => {
   const strategy = new KiroRulesStrategy();

   describe('basic properties', () => {
      it('returns correct rules directory', () => {
         expect(strategy.getRulesDir()).toBe('steering');
      });

      it('returns correct file extension', () => {
         expect(strategy.getFileExtension()).toBe('.md');
      });

      it('returns correct global rules path', () => {
         expect(strategy.getGlobalRulesPath()).toBe('.kiro/steering');
      });
   });

   describe('formatRule', () => {
      it('formats rule with always activation', () => {
         const rule: EditorRule = {
            name: 'test-rule',
            content: 'Test rule content',
            activation: { type: 'always' },
         };

         const formatted = strategy.formatRule(rule);

         expect(formatted).toContain('---');
         expect(formatted).toContain('inclusion: always');
         expect(formatted).toContain('Test rule content');
      });

      it('formats rule with auto activation and description', () => {
         const rule: EditorRule = {
            name: 'auto-rule',
            content: 'Auto rule content',
            activation: {
               type: 'auto',
               description: 'Auto-applied rule',
            },
         };

         const formatted = strategy.formatRule(rule);

         expect(formatted).toContain('inclusion: always');
         expect(formatted).toContain('description: "Auto-applied rule"');
         expect(formatted).toContain('Auto rule content');
      });

      it('formats rule with glob activation', () => {
         const rule: EditorRule = {
            name: 'glob-rule',
            content: 'Glob rule content',
            activation: {
               type: 'glob',
               globs: ['*.ts', '*.tsx'],
            },
         };

         const formatted = strategy.formatRule(rule);

         expect(formatted).toContain('inclusion: fileMatch');
         expect(formatted).toContain('fileMatchPattern: "*.ts,*.tsx"');
         expect(formatted).toContain('Glob rule content');
      });

      it('formats rule with manual activation', () => {
         const rule: EditorRule = {
            name: 'manual-rule',
            content: 'Manual rule content',
            activation: { type: 'manual' },
         };

         const formatted = strategy.formatRule(rule);

         expect(formatted).toContain('inclusion: manual');
         expect(formatted).toContain('Manual rule content');
      });

      it('preserves multiline content', () => {
         const rule: EditorRule = {
            name: 'multiline',
            content: 'Line 1\nLine 2\nLine 3',
            activation: { type: 'always' },
         };

         const formatted = strategy.formatRule(rule);

         expect(formatted).toContain('Line 1\nLine 2\nLine 3');
      });
   });

   describe('detectFormat', () => {
      it('detects Kiro format with inclusion field', () => {
         const content = `---
inclusion: always
---

Rule content`;

         expect(strategy.detectFormat(content)).toBe(true);
      });

      it('does not detect format without frontmatter', () => {
         const content = 'Just plain content';

         expect(strategy.detectFormat(content)).toBe(false);
      });

      it('does not detect format with different frontmatter', () => {
         const content = `---
trigger: always_on
---

Content`;

         expect(strategy.detectFormat(content)).toBe(false);
      });
   });

   describe('parseFrontmatter', () => {
      it('parses inclusion: always', () => {
         const content = `---
inclusion: always
---

Rule content`;

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.content).toBe('Rule content');
         expect(parsed.metadata.activation).toBe('always');
      });

      it('parses inclusion: manual', () => {
         const content = `---
inclusion: manual
---

Manual rule`;

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.content).toBe('Manual rule');
         expect(parsed.metadata.activation).toBe('manual');
      });

      it('parses inclusion: fileMatch with pattern', () => {
         const content = `---
inclusion: fileMatch
fileMatchPattern: "*.ts,*.tsx"
---

TypeScript rule`;

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.content).toBe('TypeScript rule');
         expect(parsed.metadata.activation).toBe('glob');
         expect(parsed.metadata.globs).toEqual(['*.ts', '*.tsx']);
      });

      it('parses description field', () => {
         const content = `---
inclusion: always
description: "Test description"
---

Content`;

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.metadata.description).toBe('Test description');
      });

      it('handles content without frontmatter', () => {
         const content = 'Plain content without frontmatter';

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.content).toBe(content);
         expect(parsed.metadata).toEqual({});
      });

      it('trims whitespace from globs', () => {
         const content = `---
inclusion: fileMatch
fileMatchPattern: "*.ts, *.tsx, *.js"
---

Content`;

         const parsed = strategy.parseFrontmatter(content);

         expect(parsed.metadata.globs).toEqual(['*.ts', '*.tsx', '*.js']);
      });
   });

   describe('round trip', () => {
      it('formats then parses always activation', () => {
         const original: EditorRule = {
            name: 'test',
            content: 'Test content',
            activation: { type: 'always' },
         };

         const formatted = strategy.formatRule(original);
         const parsed = strategy.parseFrontmatter(formatted);

         expect(parsed.content).toBe(original.content);
         expect(parsed.metadata.activation).toBe('always');
      });

      it('formats then parses glob activation', () => {
         const original: EditorRule = {
            name: 'test',
            content: 'Test content',
            activation: {
               type: 'glob',
               globs: ['*.ts', '*.js'],
            },
         };

         const formatted = strategy.formatRule(original);
         const parsed = strategy.parseFrontmatter(formatted);

         expect(parsed.content).toBe(original.content);
         expect(parsed.metadata.activation).toBe('glob');
         expect(parsed.metadata.globs).toEqual(['*.ts', '*.js']);
      });

      it('formats then parses manual activation', () => {
         const original: EditorRule = {
            name: 'test',
            content: 'Test content',
            activation: { type: 'manual' },
         };

         const formatted = strategy.formatRule(original);
         const parsed = strategy.parseFrontmatter(formatted);

         expect(parsed.content).toBe(original.content);
         expect(parsed.metadata.activation).toBe('manual');
      });
   });
});
