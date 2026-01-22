import { describe, it, expect } from 'vitest';
import { parseRuleFrontmatter } from '../frontmatter-parser.js';

describe('parseRuleFrontmatter', () => {
   describe('content without front-matter', () => {
      it('returns content unchanged when no front-matter present', () => {
         const content = 'Just some markdown content\n\nWith multiple lines.';
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe(content);
         expect(result.metadata).toEqual({});
      });

      it('handles content starting with --- but not valid front-matter', () => {
         const content = '--- some text\nNot front-matter';
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe(content);
         expect(result.metadata).toEqual({});
      });
   });

   describe('Windsurf front-matter format', () => {
      it('parses trigger: always_on', () => {
         const content = `---
trigger: always_on
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('always');
      });

      it('parses trigger: model_decision with description', () => {
         const content = `---
trigger: model_decision
description: "Use when working with TypeScript files"
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('auto');
         expect(result.metadata.description).toBe('Use when working with TypeScript files');
      });

      it('parses trigger: glob with inline globs', () => {
         const content = `---
trigger: glob
globs: *.ts, *.tsx
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('glob');
         expect(result.metadata.globs).toEqual(['*.ts', '*.tsx']);
      });

      it('parses trigger: manual', () => {
         const content = `---
trigger: manual
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('manual');
      });
   });

   describe('Cursor front-matter format', () => {
      it('parses alwaysApply: true', () => {
         const content = `---
alwaysApply: true
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('always');
      });

      it('parses alwaysApply: false with globs', () => {
         const content = `---
description: "TypeScript rules"
globs: *.ts, *.tsx
alwaysApply: false
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('glob');
         expect(result.metadata.description).toBe('TypeScript rules');
         expect(result.metadata.globs).toEqual(['*.ts', '*.tsx']);
      });

      it('parses alwaysApply: false without globs as auto', () => {
         const content = `---
description: "Some rule"
alwaysApply: false
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('auto');
         expect(result.metadata.description).toBe('Some rule');
      });
   });

   describe('Claude Code front-matter format', () => {
      it('parses paths as globs (array format)', () => {
         const content = `---
description: "TypeScript rules"
paths:
  - src/**/*.ts
  - lib/**/*.ts
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('glob');
         expect(result.metadata.description).toBe('TypeScript rules');
         expect(result.metadata.globs).toEqual(['src/**/*.ts', 'lib/**/*.ts']);
      });

      it('parses paths as globs (inline format)', () => {
         const content = `---
paths: src/**/*.ts, lib/**/*.ts
---

Rule content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Rule content here.');
         expect(result.metadata.activation).toBe('glob');
         expect(result.metadata.globs).toEqual(['src/**/*.ts', 'lib/**/*.ts']);
      });
   });

   describe('description parsing', () => {
      it('strips surrounding double quotes from description', () => {
         const content = `---
description: "Quoted description"
---

Content.`;
         const result = parseRuleFrontmatter(content);

         expect(result.metadata.description).toBe('Quoted description');
      });

      it('strips surrounding single quotes from description', () => {
         const content = `---
description: 'Single quoted'
---

Content.`;
         const result = parseRuleFrontmatter(content);

         expect(result.metadata.description).toBe('Single quoted');
      });

      it('handles unquoted description', () => {
         const content = `---
description: Unquoted description
---

Content.`;
         const result = parseRuleFrontmatter(content);

         expect(result.metadata.description).toBe('Unquoted description');
      });
   });

   describe('edge cases', () => {
      it('handles Windows line endings (CRLF)', () => {
         const content = '---\r\ntrigger: always_on\r\n---\r\n\r\nContent.';
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Content.');
         expect(result.metadata.activation).toBe('always');
      });

      it('handles front-matter with no trailing newline after closing ---', () => {
         const content = `---
trigger: always_on
---
Content without blank line.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toBe('Content without blank line.');
         expect(result.metadata.activation).toBe('always');
      });

      it('preserves content that looks like front-matter after actual front-matter', () => {
         const content = `---
trigger: always_on
---

Some content.

---
This is not front-matter, just a horizontal rule.
---`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).toContain('This is not front-matter');
         expect(result.metadata.activation).toBe('always');
      });
   });

   describe('regression: duplicate front-matter prevention', () => {
      it('extracts front-matter so formatRule does not duplicate it', () => {
         // This is the exact content from the bug report
         const sourceContent = `---
trigger: always_on
---

You ABSOLUTELY must not:

   * DO NOT \`git push\` without express permission`;

         const result = parseRuleFrontmatter(sourceContent);

         // Content should NOT contain front-matter
         expect(result.content).not.toContain('---');
         expect(result.content).not.toContain('trigger:');
         expect(result.content.startsWith('You ABSOLUTELY must not:')).toBe(true);

         // Metadata should have activation extracted
         expect(result.metadata.activation).toBe('always');
      });

      it('content should not start with front-matter delimiters after parsing', () => {
         const content = `---
trigger: model_decision
description: "Test rule"
---

# My Rule

Content here.`;
         const result = parseRuleFrontmatter(content);

         expect(result.content).not.toMatch(/^---/);
         expect(result.content.startsWith('# My Rule')).toBe(true);
      });
   });
});
