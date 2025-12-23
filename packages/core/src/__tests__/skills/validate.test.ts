import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { validateSkill } from '../../skills/validate.js';
import type { ParsedSkill } from '@a1st/aix-schema';
import { safeRm } from '../../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-validate');

function createParsedSkill(overrides: Partial<ParsedSkill> = {}): ParsedSkill {
   return {
      frontmatter: {
         name: 'test-skill',
         description: 'A test skill with a sufficiently long description for validation',
      },
      body: '## Instructions\n\nTest content.',
      basePath: join(testDir, 'test-skill'),
      source: 'local',
      ...overrides,
   };
}

describe('validateSkill', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('validates a complete skill', async () => {
      const skillDir = join(testDir, 'test-skill');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: test-skill
description: A test skill with a sufficiently long description for validation
---

Content.
`,
      );

      const skill = createParsedSkill({ basePath: skillDir });
      const result = await validateSkill(skill);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
   });

   it('warns when skill name does not match directory name', async () => {
      const skillDir = join(testDir, 'different-name');

      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '');

      const skill = createParsedSkill({
         basePath: skillDir,
         frontmatter: {
            name: 'mismatched-name',
            description: 'A test skill with a sufficiently long description for validation',
         },
      });
      const result = await validateSkill(skill);

      expect(result.warnings).toContain(
         'Skill name "mismatched-name" does not match directory name "different-name"',
      );
   });

   it('warns when description is too short', async () => {
      const skillDir = join(testDir, 'short-desc');

      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '');

      const skill = createParsedSkill({
         basePath: skillDir,
         frontmatter: {
            name: 'short-desc',
            description: 'Too short',
         },
      });
      const result = await validateSkill(skill);

      expect(result.warnings).toContain(
         'Description is short - consider adding more detail for better AI discovery',
      );
   });

   it('errors when SKILL.md is missing', async () => {
      const skillDir = join(testDir, 'no-skill-md');

      await mkdir(skillDir, { recursive: true });

      const skill = createParsedSkill({ basePath: skillDir });
      const result = await validateSkill(skill);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SKILL.md not found');
   });

   it('validates optional directories when present', async () => {
      const skillDir = join(testDir, 'with-dirs');

      await mkdir(skillDir, { recursive: true });
      await mkdir(join(skillDir, 'scripts'), { recursive: true });
      await mkdir(join(skillDir, 'references'), { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '');

      const skill = createParsedSkill({
         basePath: skillDir,
         frontmatter: {
            name: 'with-dirs',
            description: 'A skill with optional directories for testing validation',
         },
      });
      const result = await validateSkill(skill);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
   });
});
