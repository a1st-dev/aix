import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { createBackup, restoreBackup, listBackups } from '../backup.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.cwd(), 'test-fixtures', 'backup');

describe('backup', () => {
   beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('creates backup of file', async () => {
      const filePath = join(testDir, 'ai.json'),
            content = JSON.stringify({ skills: {} });

      await writeFile(filePath, content, 'utf-8');

      const backup = await createBackup(filePath);

      expect(backup.path).toBeDefined();
      expect(backup.timestamp).toBeInstanceOf(Date);

      const backupContent = await readFile(backup.path, 'utf-8');

      expect(backupContent).toBe(content);
   });

   it('restores backup to target', async () => {
      const filePath = join(testDir, 'ai.json'),
            originalContent = JSON.stringify({ skills: {} }),
            updatedContent = JSON.stringify({ skills: { typescript: '^1.0.0' } });

      await writeFile(filePath, originalContent, 'utf-8');
      const backup = await createBackup(filePath);

      await writeFile(filePath, updatedContent, 'utf-8');
      await restoreBackup(backup.path, filePath);

      const restoredContent = await readFile(filePath, 'utf-8');

      expect(restoredContent).toBe(originalContent);
   });

   it('lists backups in chronological order', async () => {
      const filePath = join(testDir, 'ai.json');

      await writeFile(filePath, JSON.stringify({ skills: {} }), 'utf-8');

      await createBackup(filePath);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createBackup(filePath);

      const backups = await listBackups(filePath);

      expect(backups).toHaveLength(2);
      expect(backups[0]?.timestamp.getTime()).toBeGreaterThan(backups[1]?.timestamp.getTime() ?? 0);
   });

   it('cleans up old backups', async () => {
      const filePath = join(testDir, 'ai.json');

      await writeFile(filePath, JSON.stringify({ skills: {} }), 'utf-8');

      // Sequential execution required - each backup must complete before the next
      // to test cleanup behavior with timestamps
      for (let i = 0; i < 7; i++) {
         // eslint-disable-next-line no-await-in-loop -- Sequential for timestamp ordering
         await createBackup(filePath, { maxBackups: 5 });
         // eslint-disable-next-line no-await-in-loop -- Delay needed between backups
         await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const backups = await listBackups(filePath);

      expect(backups.length).toBeLessThanOrEqual(5);
   });
});
