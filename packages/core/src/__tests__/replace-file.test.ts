import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import { replaceFile } from '../fs/replace-file.js';
import { safeRm } from '../fs/safe-rm.js';

const OWNER_ONLY = 0o600,
      PERMISSION_BITS = 0o777;

describe('replaceFile', () => {
   let testDir: string;

   beforeEach(async () => {
      testDir = join(process.env.HOME ?? '', 'test-fixtures', 'replace-file');
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('replaces the content and leaves no temporary file behind', async () => {
      const path = join(testDir, 'settings.json');

      await writeFile(path, 'before');

      await replaceFile(path, 'after');

      expect(await readFile(path, 'utf-8')).toStrictEqual('after');
      expect(await readdir(testDir)).toEqual([ 'settings.json' ]);
   });

   it('creates the file and its directory when they do not exist', async () => {
      const path = join(testDir, 'nested', 'deeper', 'settings.json');

      await replaceFile(path, 'created');

      expect(await readFile(path, 'utf-8')).toStrictEqual('created');
   });

   it.skipIf(process.platform === 'win32')('keeps the permissions of the file it replaces', async () => {
      const path = join(testDir, 'credentials.json');

      await writeFile(path, 'before');
      await chmod(path, OWNER_ONLY);

      await replaceFile(path, 'after');

      expect((await stat(path)).mode & PERMISSION_BITS).toStrictEqual(OWNER_ONLY);
   });

   it.skipIf(process.platform === 'win32')('writes through a symlink instead of replacing it', async () => {
      const target = join(testDir, 'dotfiles-settings.json'),
            link = join(testDir, 'settings.json');

      await writeFile(target, 'before');
      await symlink(target, link);

      await replaceFile(link, 'after');

      expect((await lstat(link)).isSymbolicLink()).toStrictEqual(true);
      expect(await readFile(target, 'utf-8')).toStrictEqual('after');
   });
});
