import { defineConfig } from 'vitest/config';

export default defineConfig({
   test: {
      globals: true,
      environment: 'node',
      disableConsoleIntercept: true,
      testTimeout: 20000,
      hookTimeout: 20000,
   },
});
