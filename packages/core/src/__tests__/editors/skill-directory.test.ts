import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { replaceSkillDirectory } from '../../editors/strategies/shared/skill-directory.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('replaceSkillDirectory', () => {
   let testDir: string;
   let sourceDir: string;
   let destinationDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-skill-directory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      sourceDir = join(testDir, 'source-skill');
      destinationDir = join(testDir, '.aix', 'skills', 'shared-skill');
      await mkdir(join(sourceDir, 'nested'), { recursive: true });
      await writeFile(join(sourceDir, 'SKILL.md'), '# Shared skill');
      await writeFile(join(sourceDir, 'rules.md'), 'A rule');
      await writeFile(join(sourceDir, 'nested', 'refs.md'), 'A reference');
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('serializes concurrent replacements of the same destination', async () => {
      const results = await Promise.all(
         Array.from({ length: 8 }, () => replaceSkillDirectory(sourceDir, destinationDir)),
      );

      expect(results.filter((action) => action === 'create')).toHaveLength(1);
      expect(results.filter((action) => action === 'update')).toHaveLength(7);
      expect(await readFile(join(destinationDir, 'SKILL.md'), 'utf8')).toBe('# Shared skill');
      expect(await readFile(join(destinationDir, 'nested', 'refs.md'), 'utf8')).toBe('A reference');

      const leftovers = await readdir(join(testDir, '.aix', 'skills'));

      expect(leftovers.filter((entry) => entry.includes('.staging') || entry.includes('.backup'))).toEqual([]);
   });

   it('serializes concurrent replacements of an existing destination', async () => {
      await replaceSkillDirectory(sourceDir, destinationDir);
      await writeFile(join(destinationDir, 'stale.md'), 'stale');

      const results = await Promise.all(
         Array.from({ length: 8 }, () => replaceSkillDirectory(sourceDir, destinationDir)),
      );

      expect(results.every((action) => action === 'update')).toBe(true);
      expect(existsSync(join(destinationDir, 'stale.md'))).toBe(false);
      expect(await readFile(join(destinationDir, 'SKILL.md'), 'utf8')).toBe('# Shared skill');
   });

   it('allows concurrent replacements of different destinations', async () => {
      const secondDestination = join(testDir, '.aix', 'skills', 'other-skill');

      await Promise.all([
         replaceSkillDirectory(sourceDir, destinationDir),
         replaceSkillDirectory(sourceDir, secondDestination),
      ]);

      expect(existsSync(join(destinationDir, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(secondDestination, 'SKILL.md'))).toBe(true);
   });
});
