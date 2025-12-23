import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { parseSkillMd } from '../../skills/parser.js';
import { safeRm } from '../../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-parser');

describe('parseSkillMd', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('parses valid SKILL.md with frontmatter', async () => {
      const skillDir = join(testDir, 'my-skill');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: my-skill
description: A test skill for unit testing purposes
license: MIT
---

## Instructions

This is the skill body content.
`,
      );

      const result = await parseSkillMd(skillDir, 'local');

      expect(result.frontmatter.name).toBe('my-skill');
      expect(result.frontmatter.description).toBe('A test skill for unit testing purposes');
      expect(result.frontmatter.license).toBe('MIT');
      expect(result.body).toContain('## Instructions');
      expect(result.basePath).toBe(skillDir);
      expect(result.source).toBe('local');
   });

   it('parses SKILL.md with optional metadata', async () => {
      const skillDir = join(testDir, 'meta-skill');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: meta-skill
description: A skill with metadata
metadata:
  author: test-author
  version: "1.0.0"
compatibility: Requires MCP support
allowed-tools: Bash(npm:*) Read Write
---

Content here.
`,
      );

      const result = await parseSkillMd(skillDir, 'npm');

      expect(result.frontmatter.name).toBe('meta-skill');
      expect(result.frontmatter.metadata).toEqual({
         author: 'test-author',
         version: '1.0.0',
      });
      expect(result.frontmatter.compatibility).toBe('Requires MCP support');
      expect(result.frontmatter['allowed-tools']).toBe('Bash(npm:*) Read Write');
      expect(result.source).toBe('npm');
   });

   it('throws error for missing frontmatter', async () => {
      const skillDir = join(testDir, 'no-frontmatter');

      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Just markdown\n\nNo frontmatter here.');

      await expect(parseSkillMd(skillDir, 'local')).rejects.toThrow('missing frontmatter');
   });

   it('throws error for invalid frontmatter schema', async () => {
      const skillDir = join(testDir, 'invalid-schema');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: INVALID_NAME_WITH_CAPS
description: Test
---

Content.
`,
      );

      await expect(parseSkillMd(skillDir, 'local')).rejects.toThrow();
   });

   it('throws error for missing SKILL.md file', async () => {
      const skillDir = join(testDir, 'empty-dir');

      await mkdir(skillDir, { recursive: true });

      await expect(parseSkillMd(skillDir, 'local')).rejects.toThrow();
   });
});
