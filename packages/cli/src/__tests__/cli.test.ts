import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { runCommand } from '@oclif/test';

const __dirname = dirname(fileURLToPath(import.meta.url)),
      root = join(__dirname, '../..');

describe('aix CLI', () => {
   it('shows help', async () => {
      const { stdout } = await runCommand(['--help'], { root });

      expect(stdout).toContain('aix');
   });

   it('shows version', async () => {
      const { stdout } = await runCommand(['--version'], { root });

      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
   });

   it('suggests similar commands for unknown commands', async () => {
      const { error } = await runCommand(['validat'], { root });

      // The not-found plugin should produce an error for unknown commands
      expect(error).toBeDefined();
   });
});
