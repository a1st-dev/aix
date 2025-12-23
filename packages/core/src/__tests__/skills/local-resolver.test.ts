import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { resolveLocal } from '../../skills/resolvers/local.js';
import { safeRm } from '../../fs/safe-rm.js';

const testDir = join(tmpdir(), 'aix-test-local-resolver');

describe('resolveLocal', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('resolves a local skill directory', async () => {
      const skillDir = join(testDir, 'my-skill');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: my-skill
description: A local test skill for resolver testing
---

## Instructions

Local skill content.
`,
      );

      const result = await resolveLocal({ type: 'local', path: './my-skill' }, testDir);

      expect(result.frontmatter.name).toBe('my-skill');
      expect(result.source).toBe('local');
      expect(result.basePath).toBe(skillDir);
   });

   it('resolves with absolute path', async () => {
      const skillDir = join(testDir, 'absolute-skill');

      await mkdir(skillDir, { recursive: true });
      await writeFile(
         join(skillDir, 'SKILL.md'),
         `---
name: absolute-skill
description: A skill resolved by absolute path
---

Content.
`,
      );

      const result = await resolveLocal({ type: 'local', path: skillDir }, '/');

      expect(result.frontmatter.name).toBe('absolute-skill');
   });

   it('throws error for non-existent path', async () => {
      await expect(resolveLocal({ type: 'local', path: './nonexistent' }, testDir)).rejects.toThrow();
   });

   it('throws error for file instead of directory', async () => {
      await writeFile(join(testDir, 'not-a-dir'), 'just a file');

      await expect(resolveLocal({ type: 'local', path: './not-a-dir' }, testDir)).rejects.toThrow(
         'not a directory',
      );
   });
});
