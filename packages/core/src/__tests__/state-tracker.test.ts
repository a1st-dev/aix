import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import {
   readState,
   writeState,
   trackInstall,
   trackRemoval,
   getInstalledNames,
   getInstalledItem,
   detectRemovedItems,
   detectNewItems,
   syncSectionState,
   getStatePath,
} from '../state/tracker.js';
import type { StateFile } from '../state/types.js';

let testDir: string;

beforeEach(async () => {
   testDir = join(tmpdir(), `aix-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
   await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
   await rm(testDir, { recursive: true, force: true });
});

describe('getStatePath', () => {
   it('returns project-scoped path', () => {
      const path = getStatePath('project', '/my/project');

      expect(path).toBe('/my/project/.aix/state.json');
   });

   it('returns user-scoped path under home dir', () => {
      const path = getStatePath('user');

      expect(path).toContain('.aix/state.json');
   });
});

describe('readState', () => {
   it('returns empty state when file does not exist', async () => {
      const state = await readState('project', testDir);

      expect(state.version).toBe(1);
      expect(state.scope).toBe('project');
      expect(state.installed.mcp).toEqual({});
      expect(state.installed.skills).toEqual({});
      expect(state.installed.rules).toEqual({});
      expect(state.installed.prompts).toEqual({});
   });
});

describe('writeState / readState roundtrip', () => {
   it('writes and reads state correctly', async () => {
      const state: StateFile = {
         version: 1,
         scope: 'project',
         installed: {
            mcp: {
               'my-server': {
                  installedAt: '2024-01-01T00:00:00.000Z',
                  updatedAt: '2024-01-01T00:00:00.000Z',
                  editors: ['claude-code'],
               },
            },
            skills: {},
            rules: {},
            prompts: {},
            agents: {},
         },
      };

      await writeState(state, 'project', testDir);

      const raw = await readFile(join(testDir, '.aix', 'state.json'), 'utf-8');

      expect(JSON.parse(raw)).toEqual(state);

      const read = await readState('project', testDir);

      expect(read).toEqual(state);
   });

   it('creates .aix directory when it does not exist', async () => {
      const subDir = join(testDir, 'nested');

      await mkdir(subDir, { recursive: true });

      const state: StateFile = {
         version: 1,
         scope: 'project',
         installed: { mcp: {}, skills: {}, rules: {}, prompts: {}, agents: {} },
      };

      await writeState(state, 'project', subDir);
      expect(existsSync(join(subDir, '.aix', 'state.json'))).toBe(true);
   });
});

describe('trackInstall', () => {
   it('adds a new entry', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'my-server',
         editors: ['claude-code', 'cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);

      expect(state.installed.mcp['my-server']).toBeDefined();
      expect(state.installed.mcp['my-server']!.editors).toEqual(['claude-code', 'cursor']);
   });

   it('updates an existing entry and merges editors', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'my-server',
         editors: ['claude-code'],
         projectRoot: testDir,
      });

      // Small delay so updatedAt differs
      await new Promise((r) => setTimeout(r, 10));

      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'my-server',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);
      const item = state.installed.mcp['my-server']!;

      expect(item.editors).toContain('claude-code');
      expect(item.editors).toContain('cursor');
      expect(item.installedAt).not.toBe(item.updatedAt);
   });
});

describe('trackRemoval', () => {
   it('removes a tracked entry', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'my-server',
         editors: ['claude-code'],
         projectRoot: testDir,
      });
      await trackRemoval('project', 'mcp', 'my-server', testDir);

      const state = await readState('project', testDir);

      expect(state.installed.mcp['my-server']).toBeUndefined();
   });

   it('is a no-op for untracked items', async () => {
      await trackRemoval('project', 'mcp', 'nonexistent', testDir);

      const state = await readState('project', testDir);

      expect(state.installed.mcp).toEqual({});
   });
});

describe('getInstalledNames / getInstalledItem', () => {
   it('lists installed names', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'a',
         editors: ['cursor'],
         projectRoot: testDir,
      });
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'b',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);

      expect(getInstalledNames(state, 'mcp').toSorted()).toEqual(['a', 'b']);
   });

   it('returns item metadata', async () => {
      await trackInstall({
         scope: 'project',
         section: 'rules',
         name: 'style-guide',
         editors: ['claude-code'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);
      const item = getInstalledItem(state, 'rules', 'style-guide');

      expect(item).toBeDefined();
      expect(item!.editors).toEqual(['claude-code']);
   });

   it('returns undefined for missing items', async () => {
      const state = await readState('project', testDir);

      expect(getInstalledItem(state, 'mcp', 'nope')).toBeUndefined();
   });
});

describe('detectRemovedItems', () => {
   it('detects items in state but not in config', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'a',
         editors: ['cursor'],
         projectRoot: testDir,
      });
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'b',
         editors: ['cursor'],
         projectRoot: testDir,
      });
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'c',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);
      const removed = detectRemovedItems(state, 'mcp', ['a', 'c']);

      expect(removed).toEqual(['b']);
   });

   it('returns empty when nothing was removed', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'a',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);

      expect(detectRemovedItems(state, 'mcp', ['a'])).toEqual([]);
   });
});

describe('detectNewItems', () => {
   it('detects items in config but not in state', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'a',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);
      const newItems = detectNewItems(state, 'mcp', ['a', 'b', 'c']);

      expect(newItems).toEqual(['b', 'c']);
   });
});

describe('syncSectionState', () => {
   it('replaces section state with current names', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'old-server',
         editors: ['cursor'],
         projectRoot: testDir,
      });
      await syncSectionState({
         scope: 'project',
         section: 'mcp',
         names: ['new-a', 'new-b'],
         editors: ['claude-code'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);

      expect(Object.keys(state.installed.mcp).toSorted()).toEqual(['new-a', 'new-b']);
      expect(state.installed.mcp['old-server']).toBeUndefined();
   });

   it('preserves existing metadata for items that remain', async () => {
      await trackInstall({
         scope: 'project',
         section: 'mcp',
         name: 'keep',
         editors: ['cursor'],
         projectRoot: testDir,
      });

      const before = await readState('project', testDir);
      const originalInstall = before.installed.mcp['keep']!.installedAt;

      // Small delay to ensure updatedAt differs
      await new Promise((r) => setTimeout(r, 10));

      await syncSectionState({
         scope: 'project',
         section: 'mcp',
         names: ['keep', 'new'],
         editors: ['claude-code'],
         projectRoot: testDir,
      });

      const state = await readState('project', testDir);

      expect(state.installed.mcp['keep']!.installedAt).toBe(originalInstall);
      expect(state.installed.mcp['keep']!.editors).toContain('cursor');
      expect(state.installed.mcp['keep']!.editors).toContain('claude-code');
   });
});
