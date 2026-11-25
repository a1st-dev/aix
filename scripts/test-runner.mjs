import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DISPOSABLE_ENV_VAR = 'AIX_TEST_DISPOSABLE',
      disposableCI = process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted',
      // Linux has no sandbox here, so a person can state that the machine is a container or
      // another throwaway environment with no editor config to lose. Nothing can check that
      // claim. On macOS the variable changes nothing: the run is sandboxed either way.
      declaredDisposable = process.platform === 'linux' && process.env[DISPOSABLE_ENV_VAR] === '1';

function getProtection() {
   if (process.platform === 'darwin') {
      return 'macos-sandbox';
   }
   if (disposableCI) {
      return 'disposable-ci';
   }

   return declaredDisposable ? 'declared-disposable' : undefined;
}

const protection = getProtection();

if (!protection) {
   console.error('Protected tests require macOS sandbox-exec or a disposable GitHub-hosted runner. Refusing an unprotected local run.');
   console.error(`On Linux, inside a container or another throwaway machine, set ${DISPOSABLE_ENV_VAR}=1 to run without the sandbox.`);
   process.exit(1);
}
if (protection === 'declared-disposable') {
   console.warn(`${DISPOSABLE_ENV_VAR}=1: running tests with a temporary home directory and no filesystem sandbox.`);
   console.warn('A test that bypasses the temporary home directory can write to real files on this machine.');
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
            AIX_TEST_PROTECTION: protection,
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
            // On a GitHub runner the test reporter appends its results to the job summary file.
            ...(process.env.GITHUB_STEP_SUMMARY
               ? [ `(allow file-write* (literal ${JSON.stringify(realpathSync(process.env.GITHUB_STEP_SUMMARY))}))` ]
               : []),
            `(deny file-write* (subpath ${JSON.stringify(protectedDirectory)}))`,
         ].join('\n'),
         command = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath,
         commandArgs = process.platform === 'darwin' ? ['-p', sandboxProfile, process.execPath, ...args] : args;

   // An inherited override would outrank the per-test HOME that the shared setup assigns.
   delete environment.AIX_USER_HOME;

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
