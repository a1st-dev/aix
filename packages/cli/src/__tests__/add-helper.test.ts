import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { safeRm } from '@a1st/aix-core';
import { removeSkill } from '../lib/add-helper.js';

function createTestDir(): string {
   return join(tmpdir(), `aix-add-helper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('removeSkill helper', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   it('cleans native skill files for search uninstall flow', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            sourceSkillDir = join(testDir, '.aix', 'skills', 'demo-skill'),
            editorSkillDir = join(testDir, '.github', 'skills');

      testDirs.push(testDir);

      await mkdir(sourceSkillDir, { recursive: true });
      await mkdir(editorSkillDir, { recursive: true });
      await writeFile(
         configPath,
         JSON.stringify(
            {
               $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
               skills: { 'demo-skill': './skills/demo-skill' },
               mcp: {},
               rules: {},
               prompts: {},
               editors: ['copilot'],
            },
            null,
            2,
         ),
      );
      await writeFile(
         join(sourceSkillDir, 'SKILL.md'),
         `---
name: demo-skill
description: Demo skill
---
`,
      );
      await symlink(join('..', '..', '.aix', 'skills', 'demo-skill'), join(editorSkillDir, 'demo-skill'));

      await expect(removeSkill({ configPath, name: 'demo-skill' })).resolves.toEqual({
         success: true,
         name: 'demo-skill',
      });

      expect(existsSync(join(testDir, '.aix', 'skills', 'demo-skill'))).toBe(false);
      expect(existsSync(join(testDir, '.github', 'skills', 'demo-skill'))).toBe(false);
   });

   it('removes normalized skill keys for catalog-style search results', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            sourceSkillDir = join(testDir, '.aix', 'skills', 'react-components'),
            editorSkillDir = join(testDir, '.github', 'skills');

      testDirs.push(testDir);

      await mkdir(sourceSkillDir, { recursive: true });
      await mkdir(editorSkillDir, { recursive: true });
      await writeFile(
         configPath,
         JSON.stringify(
            {
               $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
               skills: {
                  'react-components': {
                     git: 'https://github.com/google-labs-code/stitch-skills',
                     path: 'skills/react-components',
                  },
               },
               mcp: {},
               rules: {},
               prompts: {},
               editors: ['copilot'],
            },
            null,
            2,
         ),
      );
      await writeFile(
         join(sourceSkillDir, 'SKILL.md'),
         `---
name: react-components
description: Demo skill
---
`,
      );
      await symlink(join('..', '..', '.aix', 'skills', 'react-components'), join(editorSkillDir, 'react-components'));

      await expect(removeSkill({ configPath, name: 'react:components' })).resolves.toEqual({
         success: true,
         name: 'react-components',
      });

      expect(existsSync(join(testDir, '.aix', 'skills', 'react-components'))).toBe(false);
      expect(existsSync(join(testDir, '.github', 'skills', 'react-components'))).toBe(false);
      await expect(readFile(configPath, 'utf-8')).resolves.not.toContain('react-components');
   });
});
