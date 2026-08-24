import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { createEmptyConfig, type AiJsonConfig } from '@a1st/aix-schema';
import { ClaudeCodeAdapter } from '../../editors/index.js';
import {
   ClaudeCodeHooksStrategy,
   NoHooksStrategy,
   hasHooksConfigPath,
   resolveHooksConfigPath,
} from '../../editors/strategies/index.js';
import type { HooksStrategy } from '../../editors/strategies/index.js';
import { safeRm } from '../../fs/safe-rm.js';

/** Hooks only readable from the user's home directory, like an editor with no project file. */
class UserOnlyHooksStrategy extends ClaudeCodeHooksStrategy {
   override getConfigPath(): string {
      return '';
   }
}

/** Hooks only readable from the project, like an editor with no user-level file. */
class ProjectOnlyHooksStrategy extends ClaudeCodeHooksStrategy {
   override getGlobalConfigPath(): string {
      return '';
   }
}

class UserOnlyHooksAdapter extends ClaudeCodeAdapter {
   protected override readonly hooksStrategy: HooksStrategy = new UserOnlyHooksStrategy();
}

class ProjectOnlyHooksAdapter extends ClaudeCodeAdapter {
   protected override readonly hooksStrategy: HooksStrategy = new ProjectOnlyHooksStrategy();
}

class NoHooksAdapter extends ClaudeCodeAdapter {
   protected override readonly hooksStrategy: HooksStrategy = new NoHooksStrategy();
}

const config: AiJsonConfig = {
   ...createEmptyConfig(),
   hooks: {
      pre_command: [ { hooks: [ { command: './lint.sh' } ] } ],
   },
};

describe('hooks config path resolution', () => {
   it('reports both scopes for an editor that keeps hooks in each', () => {
      const strategy = new ClaudeCodeHooksStrategy();

      expect(hasHooksConfigPath(strategy, 'project')).toStrictEqual(true);
      expect(hasHooksConfigPath(strategy, 'user')).toStrictEqual(true);
   });

   it('reports no scope at all for an editor without hooks support', () => {
      const strategy = new NoHooksStrategy();

      expect(hasHooksConfigPath(strategy, 'project')).toStrictEqual(false);
      expect(hasHooksConfigPath(strategy, 'user')).toStrictEqual(false);
      expect(resolveHooksConfigPath(strategy, '.claude', 'project')).toBeUndefined();
      expect(resolveHooksConfigPath(strategy, '.claude', 'user')).toBeUndefined();
   });

   it('does not fall back to the user file when the project file is missing', () => {
      const strategy = new UserOnlyHooksStrategy();

      expect(hasHooksConfigPath(strategy, 'project')).toStrictEqual(false);
      expect(resolveHooksConfigPath(strategy, '.claude', 'project')).toBeUndefined();
      expect(resolveHooksConfigPath(strategy, '.claude', 'user')).toBeDefined();
   });

   it('does not fall back to the project file when the user file is missing', () => {
      const strategy = new ProjectOnlyHooksStrategy();

      expect(hasHooksConfigPath(strategy, 'user')).toStrictEqual(false);
      expect(resolveHooksConfigPath(strategy, '.claude', 'user')).toBeUndefined();
      expect(resolveHooksConfigPath(strategy, '.claude', 'project')).toBeDefined();
   });
});

describe('hooks that the target scope cannot hold', () => {
   let testDir: string;
   let fakeHome: string;
   let originalHome: string | undefined;

   beforeEach(async () => {
      originalHome = process.env.HOME;
      testDir = join(tmpdir(), `aix-hook-scope-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fakeHome = join(testDir, 'home');
      await mkdir(fakeHome, { recursive: true });
      process.env.HOME = fakeHome;
   });

   afterEach(async () => {
      if (originalHome === undefined) {
         delete process.env.HOME;
      } else {
         process.env.HOME = originalHome;
      }
      await safeRm(testDir, { force: true });
   });

   it('reports the project scope and writes nothing when hooks are user-only', async () => {
      const adapter = new UserOnlyHooksAdapter(),
            limitations = adapter.getTargetScopeLimitations(config, 'project'),
            editorConfig = await adapter.generateConfig(config, testDir, { targetScope: 'project' }),
            result = await adapter.apply(editorConfig, testDir, { targetScope: 'project' });

      expect(limitations.hooks?.events).toEqual(['pre_command']);
      expect(limitations.hooks?.reason).toContain('no project-scope hooks config file');
      expect(result.changes.some((change) => change.category === 'hook')).toStrictEqual(false);
      expect(existsSync(join(fakeHome, '.claude', 'settings.json'))).toStrictEqual(false);
   });

   it('reports the user scope and writes nothing when hooks are project-only', async () => {
      const adapter = new ProjectOnlyHooksAdapter(),
            limitations = adapter.getTargetScopeLimitations(config, 'user'),
            editorConfig = await adapter.generateConfig(config, testDir, { targetScope: 'user' }),
            result = await adapter.apply(editorConfig, testDir, { targetScope: 'user' });

      expect(limitations.hooks?.events).toEqual(['pre_command']);
      expect(limitations.hooks?.reason).toContain('no user-scope hooks config file');
      expect(result.changes.some((change) => change.category === 'hook')).toStrictEqual(false);
      expect(existsSync(join(testDir, '.claude', 'settings.json'))).toStrictEqual(false);
   });

   it('reports no limitation for an editor that holds hooks in both scopes', () => {
      const adapter = new ClaudeCodeAdapter();

      expect(adapter.getTargetScopeLimitations(config, 'project').hooks).toBeUndefined();
      expect(adapter.getTargetScopeLimitations(config, 'user').hooks).toBeUndefined();
   });

   it('reports the whole feature, not a scope limitation, when hooks are unsupported', () => {
      const adapter = new NoHooksAdapter();

      expect(adapter.getUnsupportedFeatures(config).hooks?.allUnsupported).toStrictEqual(true);
      expect(adapter.getTargetScopeLimitations(config, 'project').hooks).toBeUndefined();
      expect(adapter.getTargetScopeLimitations(config, 'user').hooks).toBeUndefined();
   });
});

describe('hook action fields the editor cannot express', () => {
   it('reports the dropped fields per action', () => {
      const adapter = new ClaudeCodeAdapter(),
            withUnsupportedFields: AiJsonConfig = {
               ...createEmptyConfig(),
               hooks: {
                  pre_command: [
                     { hooks: [ { command: './lint.sh', show_output: true, env: { A: 'b' } } ] },
                  ],
               },
            };

      const unsupported = adapter.getUnsupportedFeatures(withUnsupportedFields);

      expect(unsupported.hooks?.allUnsupported).toBeUndefined();
      expect(unsupported.hooks?.unsupportedFields).toEqual([
         { event: 'pre_command', matcherIndex: 0, actionIndex: 0, fields: ['show_output', 'env'] },
      ]);
      expect(unsupported.hooks?.reason).toContain('hook action fields');
   });
});
