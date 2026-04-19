import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import type { ParsedSkill } from '@a1st/aix-schema';
import { WindsurfSkillsStrategy } from '../../editors/strategies/windsurf/skills.js';
import { safeRm } from '../../fs/safe-rm.js';
import { execa } from 'execa';

// Mock execa
vi.mock('execa', () => ({
   execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

describe('WindsurfSkillsStrategy', () => {
   let testDir: string;
   let strategy: WindsurfSkillsStrategy;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-windsurf-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
      strategy = new WindsurfSkillsStrategy();
      vi.clearAllMocks();
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
      expect(strategy.getSkillsDir()).toBe('.agents/skills');
   });

   it('calls skills CLI with correct arguments including --mode copy', async () => {
      const mockSkill: ParsedSkill = {
         frontmatter: { name: 'test-skill', description: 'A test skill' },
         body: '# Test Skill',
         basePath: '/some/path',
         source: 'local',
      };

      const skills = new Map<string, ParsedSkill>([['test-skill', mockSkill]]);

      const changes = await strategy.installSkills(skills, testDir, { dryRun: false });

      // Should call execa with the skills binary and --mode copy
      expect(execa).toHaveBeenCalledWith(
         expect.stringContaining('node_modules/.bin/skills'),
         ['experimental_install', '--agent', 'windsurf', '--mode', 'copy', '-y'],
         { cwd: testDir },
      );

      // Should return a change for the skill
      expect(changes).toHaveLength(1);
      expect(changes[0]?.path).toBe(join('.agents/skills', 'test-skill'));
      expect(changes[0]?.action).toBe('update');
      expect(changes[0]?.content).toContain('Synced via skills CLI');
   });

   it('respects dry-run option without calling CLI', async () => {
      const mockSkill: ParsedSkill = {
         frontmatter: { name: 'dry-test', description: 'Dry' },
         body: '',
         basePath: '/some/path',
         source: 'local',
      };

      const skills = new Map<string, ParsedSkill>([['dry-test', mockSkill]]);

      const changes = await strategy.installSkills(skills, testDir, { dryRun: true });

      // Should NOT call execa
      expect(execa).not.toHaveBeenCalled();

      // Should still return changes for preview with --mode copy mentioned
      expect(changes).toHaveLength(1);
      expect(changes[0]?.path).toBe(join('.agents/skills', 'dry-test'));
      expect(changes[0]?.content).toContain('--mode copy');
   });
});
