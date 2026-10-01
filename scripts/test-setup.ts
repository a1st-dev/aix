import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, afterEach, vi } from 'vitest';

const testHomeRoot = process.env.AIX_TEST_HOME_ROOT,
      realHome = process.env.AIX_TEST_REAL_HOME,
      protectedPath = process.env.AIX_TEST_PROTECTED_PATH;

if (!testHomeRoot || !realHome || !protectedPath) {
   throw new Error('Tests require the protected runner. Use npm test or the package test scripts.');
}

if (process.env.AIX_TEST_PROTECTION === 'macos-sandbox') {
   let writeBlocked = false;

   try {
      closeSync(openSync(protectedPath, 'r+'));
   } catch (error) {
      writeBlocked = error instanceof Error && 'code' in error && error.code === 'EPERM';
   }

   if (!writeBlocked) {
      throw new Error('Test filesystem sandbox is missing. Refusing to run tests.');
   }
} else if (process.env.AIX_TEST_PROTECTION !== 'disposable-ci'
   || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
   throw new Error('Tests require a filesystem sandbox or a disposable GitHub-hosted runner.');
}

let currentTestHome: string;

/** Child processes inherit these values, including tests that bypass aix's runtime adapter. */
function resetTestHome(): void {
   currentTestHome = mkdtempSync(join(testHomeRoot ?? '', 'home-'));
   vi.stubEnv('HOME', currentTestHome);
   vi.stubEnv('USERPROFILE', currentTestHome);
   vi.stubEnv('XDG_CONFIG_HOME', join(currentTestHome, '.config'));
   vi.stubEnv('XDG_CACHE_HOME', join(currentTestHome, '.cache'));
   vi.stubEnv('XDG_DATA_HOME', join(currentTestHome, '.local', 'share'));
}

resetTestHome();
beforeEach(resetTestHome);
afterEach(() => {
   rmSync(currentTestHome, { recursive: true, force: true });
});
