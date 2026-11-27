import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { detectEditors, installItem, installMcpServer, installSkill, removeItem, removeSkill } from '../index.js';
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

describe('programmatic installation', () => {
   it('installs a skill into the selected editor and removes it using the recorded editor', async () => {
      const item = { name: 'my-cli', scope: 'project', projectRoot } as const;

      await Promise.all([
         mkdir(join(projectRoot, '.claude')),
         mkdir(join(projectRoot, '.cursor')),
      ]);

      const detected = await detectEditors(projectRoot, { projectOnly: true }),
            editors = detected.filter(({ id }) => {
               return id === 'cursor';
            }).map(({ id }) => {
               return id;
            }),
            installed = await installSkill({ ...item, source: { path: skillSource }, editors });

      expect(detected).toEqual(expect.arrayContaining([
         { id: 'claude-code', displayName: 'Claude Code' },
         { id: 'cursor', displayName: 'Cursor' },
      ]));
      expect(installed.editors).toEqual([ 'cursor' ]);
      expect(existsSync(join(projectRoot, '.claude', 'skills', 'my-cli', 'SKILL.md'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.cursor', 'skills', 'my-cli', 'SKILL.md'))).toStrictEqual(true);
      expect(getInstalledItem(await readState('project', projectRoot), 'skills', 'my-cli')?.editors).toEqual([ 'cursor' ]);

      const removed = await removeSkill(item);

      expect(removed.editors).toEqual([ 'cursor' ]);
      expect(existsSync(join(projectRoot, '.cursor', 'skills', 'my-cli'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.aix', 'skills', 'my-cli'))).toStrictEqual(false);
      expect(getInstalledItem(await readState('project', projectRoot), 'skills', 'my-cli')).toBeUndefined();
   });

   it('updates a server installed through the legacy API and removes it by item type', async () => {
      const item = { name: 'my-cli', scope: 'project', projectRoot } as const,
            editors = [ 'cursor' ],
            mcpPath = join(projectRoot, '.cursor', 'mcp.json');

      await mkdir(join(projectRoot, '.cursor'));
      await writeFile(mcpPath, '{"mcpServers":{"existing":{"command":"keep-me"}}}\n');
      await installItem({ ...item, section: 'mcp', value: { command: 'old-command' }, editors });
      await installMcpServer({ ...item, server: { command: 'my-cli', args: [ 'mcp' ] }, editors });

      const installed = JSON.parse(await readFile(mcpPath, 'utf8')),
            removed = await removeItem({ ...item, type: 'mcp' }),
            remaining = JSON.parse(await readFile(mcpPath, 'utf8'));

      expect(installed.mcpServers['my-cli']).toEqual({ command: 'my-cli', args: [ 'mcp' ] });
      expect(removed.results[0]?.success).toStrictEqual(true);
      expect(remaining.mcpServers).toEqual({ existing: { command: 'keep-me' } });
   });

   it('leaves a skill of the same name that it did not install', async () => {
      const userSkill = join(projectRoot, '.claude', 'skills', 'my-cli');

      await writeSkill(userSkill);

      await removeItem({ type: 'skill', name: 'my-cli', scope: 'project', projectRoot, editors: [ 'claude-code' ] });

      expect(existsSync(join(userSkill, 'SKILL.md'))).toStrictEqual(true);
   });

   it('writes nothing on a dry run', async () => {
      const result = await installItem({
         type: 'skill', name: 'my-cli', config: { path: skillSource }, scope: 'project', projectRoot, editors: [ 'claude-code' ], dryRun: true,
      });

      expect(result.results[0]?.changes.length).toBeGreaterThan(0);
      expect(existsSync(join(projectRoot, '.claude'))).toStrictEqual(false);
      expect(existsSync(join(projectRoot, '.aix'))).toStrictEqual(false);
   });
});
