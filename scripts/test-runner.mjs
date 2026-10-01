import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const disposableCI = process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted';

if (process.platform !== 'darwin' && !disposableCI) {
   console.error('Protected tests require macOS sandbox-exec or a disposable GitHub-hosted runner. Refusing an unprotected local run.');
   process.exit(1);
}

const repoRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url))),
      temporaryRoot = realpathSync(tmpdir()),
      testHomeRoot = mkdtempSync(join(temporaryRoot, 'aix-tests-')),
      protectedDirectory = join(testHomeRoot, 'protected'),
      protectedPath = join(protectedDirectory, 'settings.json'),
      realHome = realpathSync(userInfo().homedir);
let result;

try {
   const vitestCLI = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json'))),
         args = [vitestCLI, '--config', join(repoRoot, 'vitest.config.ts'), ...process.argv.slice(2)],
         environment = {
            ...process.env,
            HOME: testHomeRoot,
            USERPROFILE: testHomeRoot,
            XDG_CONFIG_HOME: join(testHomeRoot, '.config'),
            XDG_CACHE_HOME: join(testHomeRoot, '.cache'),
            XDG_DATA_HOME: join(testHomeRoot, '.local', 'share'),
            TMPDIR: testHomeRoot,
            TMP: testHomeRoot,
            TEMP: testHomeRoot,
            AIX_TEST_HOME_ROOT: testHomeRoot,
            AIX_TEST_REAL_HOME: realHome,
            AIX_TEST_PROTECTED_PATH: protectedPath,
            AIX_TEST_PROTECTION: process.platform === 'darwin' ? 'macos-sandbox' : 'disposable-ci',
         },
         // OS permissions restrict native children and symlinks, unlike Node's permission model.
         sandboxProfile = [
            '(version 1)',
            '(allow default)',
            '(deny file-write*)',
            `(allow file-write* (subpath ${JSON.stringify(testHomeRoot)})`,
            `   (subpath ${JSON.stringify(join(repoRoot, 'node_modules', '.vite'))})`,
            `   (subpath ${JSON.stringify(join(repoRoot, 'node_modules', '.vite-temp'))}))`,
            '(allow file-write* (literal "/dev/null") (literal "/dev/tty"))',
            `(deny file-write* (subpath ${JSON.stringify(protectedDirectory)}))`,
         ].join('\n'),
         command = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath,
         commandArgs = process.platform === 'darwin' ? ['-p', sandboxProfile, process.execPath, ...args] : args;

   mkdirSync(protectedDirectory);
   writeFileSync(protectedPath, 'preserve this file');
   result = spawnSync(command, commandArgs, { env: environment, stdio: 'inherit' });
} finally {
   rmSync(testHomeRoot, { recursive: true, force: true });
}

if (result.error) {
   console.error(result.error.message);
}

process.exit(result.status ?? 1);
