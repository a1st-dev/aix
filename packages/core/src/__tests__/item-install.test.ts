import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { installItem, removeItem } from '../item-install.js';
import { getInstalledItem, readState } from '../state/tracker.js';

const SKILL_MD = '---\nname: my-cli\ndescription: How to use my-cli\n---\n\n# my-cli\n';

let projectRoot: string,
    skillSource: string;

async function writeSkill(dir: string): Promise<void> {
   await mkdir(dir, { recursive: true });
   await writeFile(join(dir, 'SKILL.md'), SKILL_MD);
}

beforeEach(async () => {
   const testDir = join(tmpdir(), `aix-item-install-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

   projectRoot = join(testDir, 'project');
   skillSource = join(testDir, 'package', 'skills', 'my-cli');
   await mkdir(projectRoot, { recursive: true });
   await writeSkill(skillSource);
});

afterEach(async () => {
   await rm(join(projectRoot, '..'), { recursive: true, force: true });
});

describe('installItem and removeItem', () => {
   it('installs a skill from a directory and removes it again', async () => {
      const item = { section: 'skills', name: 'my-cli', scope: 'project', projectRoot, editors: [ 'claude-code', 'cursor' ] } as const,
            installed = await installItem({ ...item, value: { path: skillSource } });

      expect(installed.editors).toEqual([ 'claude-code', 'cursor' ]);
      expect(existsSync(join(projectRoot, '.claude', 'skills', 'my-cli', 'SKILL.md'))).toStrictEqual(true);
      expect(existsSync(join(projectRoot, '.cursor', 'skills', 'my-cli', 'SKILL.md'))).toStrictEqual(true);
      expect(getInstalledItem(await readState('project', projectRoot), 'skills', 'my-cli')?.editors).toEqual([ 'claude-code', 'cursor' ]);

      const removed = await removeItem(item);

      expect(removed.editors).toEqual([ 'claude-code', 'cursor' ]);
      expect(existsSync(join(projectRoot, '.claude', 'skills', 'my-cli'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.cursor', 'skills', 'my-cli'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.aix', 'skills', 'my-cli'))).toStrictEqual(false);
      expect(getInstalledItem(await readState('project', projectRoot), 'skills', 'my-cli')).toBeUndefined();
   });

   it('leaves a skill of the same name that it did not install', async () => {
      const userSkill = join(projectRoot, '.claude', 'skills', 'my-cli');

      await writeSkill(userSkill);

      await removeItem({ section: 'skills', name: 'my-cli', scope: 'project', projectRoot, editors: [ 'claude-code' ] });

      expect(existsSync(join(userSkill, 'SKILL.md'))).toStrictEqual(true);
   });

   it('writes nothing on a dry run', async () => {
      const result = await installItem({
         section: 'skills', name: 'my-cli', value: { path: skillSource }, scope: 'project', projectRoot, editors: [ 'claude-code' ], dryRun: true,
      });

      expect(result.results[0]?.changes.length).toBeGreaterThan(0);
      expect(existsSync(join(projectRoot, '.claude'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.aix'))).toStrictEqual(false);
   });
});
