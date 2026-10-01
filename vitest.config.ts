import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
   root: process.cwd(),
   test: {
      globals: true,
      environment: 'node',
      pool: 'forks',
      isolate: true,
      unstubEnvs: true,
      setupFiles: [fileURLToPath(new URL('./scripts/test-setup.ts', import.meta.url))],
      env: {
         HOME: process.env.AIX_TEST_HOME_ROOT,
         USERPROFILE: process.env.AIX_TEST_HOME_ROOT,
      },
      disableConsoleIntercept: true,
      testTimeout: 20000,
      hookTimeout: 20000,
   },
});
