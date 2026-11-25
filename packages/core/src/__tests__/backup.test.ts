import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'pathe';
import { createBackup, getBackupStoreDir, listAllBackups, listBackups, pruneBackups, restoreBackup } from '../backup.js';
import { safeRm } from '../fs/safe-rm.js';

const testDir = join(process.env.HOME ?? '', 'test-fixtures', 'backup');

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

   it('keeps every backup in one store under the home directory, not beside the file', async () => {
      const configDir = join(process.env.HOME ?? '', '.codex'),
            filePath = join(configDir, 'config.toml');

      await mkdir(configDir, { recursive: true });
      await writeFile(filePath, 'model = "gpt"', 'utf-8');

      const backup = await createBackup(filePath);

      expect(backup.path.startsWith(join(getBackupStoreDir(), 'home', '.codex', 'config.toml.'))).toStrictEqual(true);
      expect(existsSync(join(configDir, '.aix'))).toStrictEqual(false);
   });

   it('lists every stored backup with the file it came from', async () => {
      const first = join(testDir, 'ai.json'),
            second = join(testDir, 'mcp_config.json');

      await writeFile(first, 'first', 'utf-8');
      await writeFile(second, 'second', 'utf-8');
      await createBackup(first);
      await createBackup(second);

      const originals = (await listAllBackups()).map((backup) => {
         return backup.originalPath;
      });

      expect(originals.toSorted()).toEqual([ first, second ]);
   });

   it('restores to the original file when no target is given, backing up what it replaces', async () => {
      const filePath = join(testDir, 'ai.json');

      await writeFile(filePath, 'before', 'utf-8');

      const backup = await createBackup(filePath);

      await writeFile(filePath, 'after', 'utf-8');

      const restoredTo = await restoreBackup(backup.path),
            contents = await Promise.all((await listBackups(filePath)).map((entry) => {
               return readFile(entry.path, 'utf-8');
            }));

      expect(restoredTo).toStrictEqual(filePath);
      expect(await readFile(filePath, 'utf-8')).toStrictEqual('before');
      expect(contents.toSorted()).toEqual([ 'after', 'before' ]);
   });

   it('does not confuse the backups of files whose names share a prefix', async () => {
      const shorter = join(testDir, 'config.toml'),
            longer = join(testDir, 'config.toml.example');

      await writeFile(shorter, 'shorter', 'utf-8');
      await writeFile(longer, 'longer', 'utf-8');
      await createBackup(shorter);
      await createBackup(longer);

      expect(await listBackups(shorter)).toHaveLength(1);
      expect(await listBackups(longer)).toHaveLength(1);
   });

   it('prunes only backups older than the age limit', async () => {
      const filePath = join(testDir, 'ai.json');

      await writeFile(filePath, 'current', 'utf-8');

      const recent = await createBackup(filePath),
            oldBackup = join(dirname(recent.path), 'ai.json.2020-01-01T00-00-00-000Z.backup');

      await writeFile(oldBackup, 'old', 'utf-8');

      const pruned = await pruneBackups({ maxAgeDays: 30 });

      expect(pruned.deletedPaths).toEqual([ oldBackup ]);
      expect(existsSync(recent.path)).toStrictEqual(true);
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
