import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { safeRm, UnsafePathError } from '../fs/safe-rm.js';

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
});
