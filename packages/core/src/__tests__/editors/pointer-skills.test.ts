import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import type { ParsedSkill } from '@a1st/aix-schema';
import { PointerSkillsStrategy } from '../../editors/strategies/shared/pointer-skills.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('PointerSkillsStrategy', () => {
   let testDir: string;
   let skillSourceDir: string;
   let strategy: PointerSkillsStrategy;

   beforeEach(async () => {
      testDir = join(tmpdir(), `aix-pointer-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
      strategy = new PointerSkillsStrategy();
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   function buildSkill(frontmatterName: string = 'test-skill'): ParsedSkill {
      return {
         frontmatter: { name: frontmatterName, description: 'A test skill' },
         body: '# Test Skill',
         basePath: skillSourceDir,
         source: 'local',
      };
   }

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

   it('uses the installed skill key in generated pointer paths', () => {
      const rules = strategy.generateSkillRules(
         new Map<string, ParsedSkill>([['react-components', buildSkill('react:components')]]),
      );

      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('skill-react-components');
      expect(rules[0]?.content).toContain('.aix/skills/react-components/');
      expect(rules[0]?.content).toContain('.aix/skills/react-components/SKILL.md');
      expect(rules[0]?.content).not.toContain('.aix/skills/react:components/');
   });
});
