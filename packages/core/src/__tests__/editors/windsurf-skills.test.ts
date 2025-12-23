import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, lstat, readlink } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import type { ParsedSkill } from '@a1st/aix-schema';
import { WindsurfSkillsStrategy } from '../../editors/strategies/windsurf/skills.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('WindsurfSkillsStrategy', () => {
   let testDir: string;
   let strategy: WindsurfSkillsStrategy;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-windsurf-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
      strategy = new WindsurfSkillsStrategy();
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('is a native skills strategy', () => {
      expect(strategy.isNative()).toBe(true);
   });

   it('returns empty array for generateSkillRules (native strategies do not need pointer rules)', () => {
      const mockSkills = new Map<string, ParsedSkill>();

      expect(strategy.generateSkillRules(mockSkills)).toEqual([]);
   });

   it('returns correct skills directory', () => {
      expect(strategy.getSkillsDir()).toBe('.aix/skills');
   });

   it('installs skills with symlinks to .windsurf/skills/', async () => {
      // Create a mock skill directory
      const skillSourceDir = join(testDir, 'source-skill');

      await mkdir(skillSourceDir, { recursive: true });
      await writeFile(
         join(skillSourceDir, 'SKILL.md'),
         '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test Skill\n',
      );

      const mockSkill: ParsedSkill = {
         frontmatter: {
            name: 'test-skill',
            description: 'A test skill',
         },
         body: '# Test Skill',
         basePath: skillSourceDir,
         source: 'local',
      };

      const skills = new Map<string, ParsedSkill>([['test-skill', mockSkill]]);

      const changes = await strategy.installSkills(skills, testDir, { dryRun: false });

      // Should have 2 changes: .aix/skills/test-skill (copy) and .windsurf/skills/test-skill (symlink)
      expect(changes).toHaveLength(2);

      const aixChange = changes.find((c) => c.path.includes('.aix/skills/test-skill'));
      const windsurfChange = changes.find((c) => c.path.includes('.windsurf/skills/test-skill'));

      expect(aixChange).toBeDefined();
      expect(aixChange?.action).toBe('create');
      expect(aixChange?.category).toBe('skill');

      expect(windsurfChange).toBeDefined();
      expect(windsurfChange?.action).toBe('create');
      expect(windsurfChange?.content).toContain('symlink');

      // Verify symlink was actually created
      const symlinkPath = join(testDir, '.windsurf/skills/test-skill'),
            stats = await lstat(symlinkPath);

      expect(stats.isSymbolicLink()).toBe(true);

      // Verify symlink points to correct location (normalize for Windows backslashes)
      const linkTarget = (await readlink(symlinkPath)).replace(/\\/g, '/');

      expect(linkTarget).toContain('.aix/skills/test-skill');
   });

   it('reports update action when skill already exists', async () => {
      // Create existing skill directories
      const skillSourceDir = join(testDir, 'source-skill');

      await mkdir(skillSourceDir, { recursive: true });
      await writeFile(join(skillSourceDir, 'SKILL.md'), '---\nname: existing\ndescription: Existing\n---\n');

      await mkdir(join(testDir, '.aix/skills/existing'), { recursive: true });
      await mkdir(join(testDir, '.windsurf/skills'), { recursive: true });

      const mockSkill: ParsedSkill = {
         frontmatter: { name: 'existing', description: 'Existing' },
         body: '',
         basePath: skillSourceDir,
         source: 'local',
      };

      const skills = new Map<string, ParsedSkill>([['existing', mockSkill]]);

      const changes = await strategy.installSkills(skills, testDir, { dryRun: false });

      const aixChange = changes.find((c) => c.path.includes('.aix/skills/existing'));

      expect(aixChange?.action).toBe('update');
   });

   it('respects dry-run option', async () => {
      const skillSourceDir = join(testDir, 'source-skill');

      await mkdir(skillSourceDir, { recursive: true });
      await writeFile(join(skillSourceDir, 'SKILL.md'), '---\nname: dry-test\ndescription: Dry\n---\n');

      const mockSkill: ParsedSkill = {
         frontmatter: { name: 'dry-test', description: 'Dry' },
         body: '',
         basePath: skillSourceDir,
         source: 'local',
      };

      const skills = new Map<string, ParsedSkill>([['dry-test', mockSkill]]);

      const changes = await strategy.installSkills(skills, testDir, { dryRun: true });

      // Should still return changes for preview
      expect(changes).toHaveLength(2);

      // But directories should not exist
      await expect(lstat(join(testDir, '.aix/skills/dry-test'))).rejects.toThrow();
      await expect(lstat(join(testDir, '.windsurf/skills/dry-test'))).rejects.toThrow();
   });
});
