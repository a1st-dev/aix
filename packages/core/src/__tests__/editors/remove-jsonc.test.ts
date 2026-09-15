import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { parseJsonc } from '@a1st/aix-schema';
import { safeRm } from '../../fs/safe-rm.js';
import { removeMcpFromEditor } from '../../editors/remove.js';

const testDir = join(process.cwd(), 'test-fixtures', 'remove-jsonc');

describe('remove-jsonc comment preservation', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('removes an MCP server from Zed settings.json while preserving comments', async () => {
      const zedDir = join(testDir, '.zed'),
            settingsPath = join(zedDir, 'settings.json');

      await mkdir(zedDir, { recursive: true });
      await writeFile(
         settingsPath,
         [
            '// User editor configuration',
            '{',
            '   // Preferred theme',
            '   "theme": "One Dark",',
            '   // Context servers',
            '   "context_servers": {',
            '      // Deprecated server',
            '      "legacy_server": {',
            '         "command": "legacy-cmd"',
            '      },',
            '      // Production server',
            '      "prod_server": {',
            '         "command": "prod-cmd"',
            '      }',
            '   }',
            '}',
            '',
         ].join('\n'),
         'utf-8',
      );

      const result = await removeMcpFromEditor('zed', 'legacy_server', testDir);

      expect(result.success).toBe(true);
      expect(result.removed).toBe(true);

      const content = await readFile(settingsPath, 'utf-8');

      expect(content).toContain('// User editor configuration');
      expect(content).toContain('// Preferred theme');
      expect(content).toContain('// Context servers');
      expect(content).toContain('// Production server');
      expect(content).toContain('"prod_server"');
      expect(content).not.toContain('"legacy_server"');

      const { data: parsed } = parseJsonc<Record<string, unknown>>(content),
            servers = (parsed?.context_servers ?? {}) as Record<string, unknown>;

      expect(parsed?.theme).toBe('One Dark');
      expect(servers.prod_server).toBeDefined();
      expect(servers.legacy_server).toBeUndefined();
   });
});
