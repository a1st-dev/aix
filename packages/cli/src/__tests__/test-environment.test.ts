import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, rm, symlink } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

describe('test filesystem protection', () => {
   it('isolates both home variables before test code runs', () => {
      expect(process.env.HOME).toStrictEqual(process.env.USERPROFILE);
      expect(process.env.HOME).not.toStrictEqual(process.env.AIX_TEST_REAL_HOME);
      expect(process.env.XDG_CONFIG_HOME).toStrictEqual(join(process.env.HOME ?? '', '.config'));
   });

   it('refuses to run tests when Vitest is started without the protected runner', async () => {
      const cli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
            config = fileURLToPath(new URL('../../../../vitest.config.ts', import.meta.url));

      await expect(run(process.execPath, [cli, 'run', '--config', config, 'src/__tests__/test-environment.test.ts'], {
         env: { ...process.env, AIX_TEST_HOME_ROOT: '' },
      })).rejects.toThrow('Tests require the protected runner');
   });

   it.skipIf(process.platform !== 'darwin')('also blocks writes by native child processes', async () => {
      const protectedPath = process.env.AIX_TEST_PROTECTED_PATH;

      if (!protectedPath) {
         throw new Error('This check requires the protected runner.');
      }

      await expect(run('/bin/sh', ['-c', 'printf unsafe > "$AIX_TEST_PROTECTED_PATH"'])).rejects.toThrow('Operation not permitted');

      expect(await readFile(protectedPath, 'utf-8')).toStrictEqual('preserve this file');
   });

   it.skipIf(process.platform !== 'darwin')('blocks writes through symlinks in the test home', async () => {
      const protectedPath = process.env.AIX_TEST_PROTECTED_PATH,
            testHome = process.env.HOME;

      if (!protectedPath || !testHome) {
         throw new Error('This check requires the protected runner.');
      }

      const link = join(testHome, 'settings.json');

      await symlink(protectedPath, link);

      await expect(run(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "unsafe")', link]))
         .rejects.toThrow('operation not permitted');

      expect(await readFile(protectedPath, 'utf-8')).toStrictEqual('preserve this file');
   });

   it.skipIf(process.platform !== 'darwin')('denies writes even when a Node child process gets the real HOME', async () => {
      const realHome = process.env.AIX_TEST_REAL_HOME,
            testHomeRoot = process.env.AIX_TEST_HOME_ROOT;

      if (!realHome || !testHomeRoot) {
         throw new Error('This check requires the protected runner.');
      }

      // A unique disposable probe avoids putting actual configuration at risk if the guard fails.
      const probeName = `.${basename(testHomeRoot)}-write-probe`,
            command = 'require("node:fs").writeFileSync(require("node:path").join(process.env.HOME, process.argv[1]), "unsafe")';

      try {
         await expect(run(process.execPath, ['-e', command, probeName], {
            env: { ...process.env, HOME: realHome, USERPROFILE: realHome },
         })).rejects.toThrow('operation not permitted');
      } finally {
         await rm(join(realHome, probeName), { force: true });
      }
   });
});
