import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readlink, lstat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize } from 'pathe';
import { tmpdir } from 'node:os';
import type { ParsedSkill } from '@a1st/aix-schema';
import { WindsurfSkillsStrategy } from '../../editors/strategies/windsurf/skills.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('WindsurfSkillsStrategy', () => {
   let testDir: string;
   let skillSourceDir: string;
   let strategy: WindsurfSkillsStrategy;
   let originalHome: string | undefined;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-windsurf-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      skillSourceDir = join(testDir, 'source-skill');
      await mkdir(skillSourceDir, { recursive: true });
      await writeFile(
         join(skillSourceDir, 'SKILL.md'),
         `---
name: test-skill
description: A test skill
---

# Test Skill
`,
      );
      strategy = new WindsurfSkillsStrategy();
      originalHome = process.env.HOME;
   });

   afterEach(async () => {
      if (originalHome === undefined) {
         delete process.env.HOME;
      } else {
         process.env.HOME = originalHome;
      }
      await safeRm(testDir, { force: true });
   });

   function buildSkill(name: string = 'test-skill'): ParsedSkill {
      return {
         frontmatter: { name, description: 'A test skill' },
         body: '# Test Skill',
         basePath: skillSourceDir,
         source: 'local',
      };
   }

   it('is a native skills strategy', () => {
      expect(strategy.isNative()).toBe(true);
   });

   it('returns empty array for generateSkillRules', () => {
      expect(strategy.generateSkillRules(new Map())).toEqual([]);
   });

   it('uses .aix as the canonical skills directory', () => {
      expect(strategy.getSkillsDir()).toBe('.aix/skills');
   });

   it('copies skills into .aix/skills and links them into the editor directory', async () => {
      const changes = await strategy.installSkills(
         new Map<string, ParsedSkill>([['test-skill', buildSkill()]]),
         testDir,
         { dryRun: false },
      );

      expect(changes).toHaveLength(2);
      expect(changes[0]?.path).toBe(join(testDir, '.aix', 'skills', 'test-skill'));
      expect(changes[1]?.path).toBe(join(testDir, '.windsurf', 'skills', 'test-skill'));

      const copiedSkillPath = join(testDir, '.aix', 'skills', 'test-skill', 'SKILL.md'),
            linkedSkillPath = join(testDir, '.windsurf', 'skills', 'test-skill');

      expect(existsSync(copiedSkillPath)).toBe(true);
      expect(existsSync(linkedSkillPath)).toBe(true);

      const linkStats = await lstat(linkedSkillPath),
            linkTarget = await readlink(linkedSkillPath);

      expect(linkStats.isSymbolicLink()).toBe(true);
      expect(normalize(linkTarget)).toBe(join('..', '..', '.aix', 'skills', 'test-skill'));
   });

   it('returns planned changes in dry-run mode without writing files', async () => {
      const changes = await strategy.installSkills(
         new Map<string, ParsedSkill>([['dry-test', buildSkill('dry-test')]]),
         testDir,
         { dryRun: true },
      );

      expect(changes).toHaveLength(2);
      expect(changes[0]?.path).toBe(join(testDir, '.aix', 'skills', 'dry-test'));
      expect(changes[0]?.content).toContain('[skill directory:');
      expect(changes[1]?.path).toBe(join(testDir, '.windsurf', 'skills', 'dry-test'));
      expect(changes[1]?.content).toContain('[symlink ->');
      expect(existsSync(join(testDir, '.aix', 'skills', 'dry-test'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'skills', 'dry-test'))).toBe(false);
   });

   it('writes user-scoped installs under HOME instead of the project root', async () => {
      const fakeHome = join(testDir, 'fake-home');

      process.env.HOME = fakeHome;

      const changes = await strategy.installSkills(
         new Map<string, ParsedSkill>([['user-skill', buildSkill('user-skill')]]),
         testDir,
         { dryRun: false, targetScope: 'user' },
      );

      expect(changes[0]?.path).toBe(join(fakeHome, '.aix', 'skills', 'user-skill'));
      expect(changes[1]?.path).toBe(join(fakeHome, '.windsurf', 'skills', 'user-skill'));
      expect(existsSync(join(fakeHome, '.aix', 'skills', 'user-skill', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(fakeHome, '.windsurf', 'skills', 'user-skill'))).toBe(true);
      expect(existsSync(join(testDir, '.aix', 'skills', 'user-skill'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'skills', 'user-skill'))).toBe(false);
   });

   it('removes stale files from the managed copy when reinstalling a skill', async () => {
      const sourceExtraFile = join(skillSourceDir, 'extra.md'),
            installedExtraFile = join(testDir, '.aix', 'skills', 'test-skill', 'extra.md');

      await writeFile(sourceExtraFile, 'extra content');
      await strategy.installSkills(new Map<string, ParsedSkill>([['test-skill', buildSkill()]]), testDir, {
         dryRun: false,
      });

      expect(existsSync(installedExtraFile)).toBe(true);

      await unlink(sourceExtraFile);
      await strategy.installSkills(new Map<string, ParsedSkill>([['test-skill', buildSkill()]]), testDir, {
         dryRun: false,
      });

      expect(existsSync(installedExtraFile)).toBe(false);
      expect(existsSync(join(testDir, '.aix', 'skills', 'test-skill', 'SKILL.md'))).toBe(true);
   });
});
