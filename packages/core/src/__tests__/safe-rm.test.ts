import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { safeRm, UnsafePathError } from '../fs/safe-rm.js';
import { nodeRuntimeAdapter, withRuntimeAdapter } from '../runtime/index.js';
import type { RuntimeAdapter, RuntimeRemoveOptions } from '../runtime/index.js';

const fixtureRoot = join(process.cwd(), '.safe-rm-regression');

describe('safeRm', () => {
   afterEach(async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
   });

   it('allows removing Codex project skill paths under .agents', async () => {
      const target = join(fixtureRoot, 'project', '.agents', 'skills', 'demo-skill');

      await mkdir(target, { recursive: true });
      await safeRm(target, { force: true });

      expect(existsSync(target)).toBe(false);
   });

   it('allows removing Copilot project skill paths under .github', async () => {
      const target = join(fixtureRoot, 'project', '.github', 'skills', 'demo-skill');

      await mkdir(target, { recursive: true });
      await safeRm(target, { force: true });

      expect(existsSync(target)).toBe(false);
   });

   it('still rejects unrelated project paths', async () => {
      const target = join(fixtureRoot, 'project', 'skills', 'demo-skill');

      await mkdir(target, { recursive: true });

      await expect(safeRm(target, { force: true })).rejects.toBeInstanceOf(UnsafePathError);
      expect(existsSync(target)).toBe(true);
   });

   it('passes retry options to recursive removals', async () => {
      const target = join(fixtureRoot, 'project', '.aix', 'tmp', 'demo-skill'),
            remove = vi.fn(async (_path: string, _options?: RuntimeRemoveOptions) => {
               return undefined;
            }),
            adapter = createRuntimeAdapter({
               fs: {
                  ...nodeRuntimeAdapter.fs,
                  rm: remove,
               },
            });

      await withRuntimeAdapter(adapter, async () => {
         await safeRm(target, { force: true });
      });

      expect(remove).toHaveBeenCalledWith(target, {
         recursive: true,
         maxRetries: 5,
         retryDelay: 100,
         force: true,
      });
   });
});

function createRuntimeAdapter(overrides: Partial<RuntimeAdapter>): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      ...overrides,
   };
}
