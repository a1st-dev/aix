import { describe, it, expect } from 'vitest';
import {
   upsertManagedSection,
   extractManagedSection,
   AIX_SECTION_BEGIN,
   AIX_SECTION_END,
} from '../../editors/section-managed-markdown.js';

describe('section-managed-markdown', () => {
   describe('upsertManagedSection', () => {
      it('creates section from null content', () => {
         const result = upsertManagedSection(null, '## rule-one\n\nRule content');

         expect(result).toContain(AIX_SECTION_BEGIN);
         expect(result).toContain(AIX_SECTION_END);
         expect(result).toContain('## rule-one');
         expect(result).toContain('Rule content');
      });

      it('creates section from empty string content', () => {
         const result = upsertManagedSection('', '## rule\n\nContent');

         expect(result).toContain(AIX_SECTION_BEGIN);
         expect(result).toContain('## rule');
      });

      it('appends section to existing content without markers', () => {
         const existing = '# My Project Rules\n\nKeep it clean.\n';
         const result = upsertManagedSection(existing, '## aix-rule\n\nManaged content');

         expect(result).toContain('# My Project Rules');
         expect(result).toContain('Keep it clean.');
         expect(result).toContain(AIX_SECTION_BEGIN);
         expect(result).toContain('## aix-rule');
         expect(result).toContain(AIX_SECTION_END);

         // User content comes before managed section
         const userIdx = result.indexOf('# My Project Rules');
         const managedIdx = result.indexOf(AIX_SECTION_BEGIN);

         expect(userIdx).toBeLessThan(managedIdx);
      });

      it('replaces content between existing markers', () => {
         const existing = [
            '# User header',
            '',
            AIX_SECTION_BEGIN,
            '## old-rule',
            '',
            'Old content',
            AIX_SECTION_END,
            '',
            '# User footer',
         ].join('\n');

         const result = upsertManagedSection(existing, '## new-rule\n\nNew content');

         expect(result).toContain('# User header');
         expect(result).toContain('## new-rule');
         expect(result).toContain('New content');
         expect(result).toContain('# User footer');
         expect(result).not.toContain('old-rule');
         expect(result).not.toContain('Old content');
      });

      it('preserves content before and after markers', () => {
         const existing = [
            '# AGENTS.md',
            '',
            'My custom instructions here.',
            '',
            AIX_SECTION_BEGIN,
            '## managed',
            AIX_SECTION_END,
            '',
            '## More user content',
            '',
            'Additional notes.',
         ].join('\n');

         const result = upsertManagedSection(existing, '## updated\n\nUpdated content');

         expect(result).toContain('# AGENTS.md');
         expect(result).toContain('My custom instructions here.');
         expect(result).toContain('## updated');
         expect(result).toContain('Updated content');
         expect(result).toContain('## More user content');
         expect(result).toContain('Additional notes.');
      });

      it('removes managed section when content is empty', () => {
         const existing = [
            '# User content',
            '',
            AIX_SECTION_BEGIN,
            '## old',
            AIX_SECTION_END,
            '',
            '# Footer',
         ].join('\n');

         const result = upsertManagedSection(existing, '');

         expect(result).toContain('# User content');
         expect(result).toContain('# Footer');
         expect(result).not.toContain(AIX_SECTION_BEGIN);
         expect(result).not.toContain(AIX_SECTION_END);
      });

      it('returns empty string when removing from null content', () => {
         expect(upsertManagedSection(null, '')).toBe('');
      });

      it('returns empty string when removing from empty content', () => {
         expect(upsertManagedSection('', '')).toBe('');
      });

      it('is idempotent — same input produces same output', () => {
         const first = upsertManagedSection(null, '## rule\n\nContent');
         const second = upsertManagedSection(first, '## rule\n\nContent');

         expect(first).toBe(second);
      });
   });

   describe('extractManagedSection', () => {
      it('returns null when no markers exist', () => {
         expect(extractManagedSection('# Just user content')).toBeNull();
      });

      it('returns null when only begin marker exists', () => {
         expect(extractManagedSection(`# Content\n${AIX_SECTION_BEGIN}\n## rule`)).toBeNull();
      });

      it('returns content between markers', () => {
         const content = [
            '# Header',
            '',
            AIX_SECTION_BEGIN,
            '## rule-one',
            '',
            'Rule content here',
            AIX_SECTION_END,
            '',
            '# Footer',
         ].join('\n');

         const result = extractManagedSection(content);

         expect(result).toBe('## rule-one\n\nRule content here');
      });

      it('trims whitespace from extracted content', () => {
         const content = `${AIX_SECTION_BEGIN}\n\n  content  \n\n${AIX_SECTION_END}`;
         const result = extractManagedSection(content);

         expect(result).toBe('content');
      });
   });
});
