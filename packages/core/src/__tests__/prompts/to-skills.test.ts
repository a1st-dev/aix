import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { convertPromptsToSkills, sanitizeSkillName } from '../../prompts/to-skills.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('prompts/to-skills', () => {
   const tempRoots: string[] = [];

   afterEach(async () => {
      await Promise.all(tempRoots.map((path) => safeRm(path, { force: true })));
      tempRoots.length = 0;
   });

   it('converts a prompt into an instruction-only skill', async () => {
      const tempRoot = join(tmpdir(), `aix-prompt-skill-test-${Date.now()}`);

      tempRoots.push(tempRoot);

      const result = await convertPromptsToSkills(
         [
            {
               name: 'review',
               description: 'Review the current change.',
               argumentHint: '[diff]',
               content: 'Review this diff.',
            },
         ],
         { tempRoot },
      );

      expect(Array.from(result.skills.keys())).toEqual(['review']);

      const skillContent = await readFile(join(tempRoot, 'review', 'SKILL.md'), 'utf-8');

      expect(skillContent).toContain('name: review');
      expect(skillContent).toContain('description: "Review the current change."');
      expect(skillContent).toContain('Argument hint from the original prompt: `[diff]`');
      expect(skillContent).toContain('Review this diff.');
   });

   it('renames prompt skills without overwriting existing skill names', async () => {
      const tempRoot = join(tmpdir(), `aix-prompt-skill-conflict-test-${Date.now()}`);

      tempRoots.push(tempRoot);

      const result = await convertPromptsToSkills(
         [
            {
               name: 'review',
               content: 'Review this.',
            },
         ],
         { existingSkillNames: ['review', 'prompt-review'], tempRoot },
      );

      expect(Array.from(result.skills.keys())).toEqual(['prompt-review-2']);
      expect(result.conflicts).toEqual([{ promptName: 'review', skillName: 'prompt-review-2' }]);
   });

   it('preserves numeric suffixes for long conflict names', async () => {
      const tempRoot = join(tmpdir(), `aix-prompt-skill-long-conflict-test-${Date.now()}`),
            promptName = 'x'.repeat(64),
            firstConflict = sanitizeSkillName(`prompt-${promptName}`);

      tempRoots.push(tempRoot);

      const result = await convertPromptsToSkills(
         [
            {
               name: promptName,
               content: 'Do the thing.',
            },
         ],
         { existingSkillNames: [promptName, firstConflict], tempRoot },
      );

      const [skillName] = Array.from(result.skills.keys());

      expect(skillName).toMatch(/-2$/);
      expect(skillName).toHaveLength(64);
   });
});
