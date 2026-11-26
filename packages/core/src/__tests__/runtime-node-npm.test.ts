import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeRuntimeAdapter } from '../runtime/index.js';

const IGNORE_SCRIPTS_ENV_VAR = 'npm_config_ignore_scripts';

interface RecordedInstall {
   options: unknown;
   ignoreScripts: string | undefined;
}

interface RecordedCommand {
   command: string;
   args: string[];
   options: unknown;
}

const nypm = vi.hoisted(() => {
   const installs: RecordedInstall[] = [],
         pendingInstalls: Array<() => void> = [];

   return { installs, pendingInstalls, failNextInstall: false, holdInstalls: false };
});

const tinyexec = vi.hoisted(() => {
   const commands: RecordedCommand[] = [];

   return { commands, exitCode: 0 };
});

/**
 * Stands in for the package manager nypm would spawn: records the options and the part of the
 * environment a child process would inherit at the moment it starts.
 */
async function recordInstall(options: unknown): Promise<void> {
   nypm.installs.push({ options, ignoreScripts: process.env[IGNORE_SCRIPTS_ENV_VAR] });

   if (nypm.failNextInstall) {
      nypm.failNextInstall = false;
      throw new Error('npm install failed');
   }

   if (nypm.holdInstalls) {
      await new Promise<void>((resolve) => {
         nypm.pendingInstalls.push(resolve);
      });
   }
}

vi.mock('nypm', () => {
   return {
      installDependencies: (options: unknown) => {
         return recordInstall(options);
      },
      addDependency: (_name: string, options: unknown) => {
         return recordInstall(options);
      },
   };
});

vi.mock('tinyexec', () => {
   return {
      x: async (command: string, args: string[], options: unknown) => {
         tinyexec.commands.push({ command, args, options });

         return { exitCode: tinyexec.exitCode, stdout: '', stderr: 'postinstall: download failed' };
      },
   };
});

describe('node runtime adapter package installs', () => {
   const originalIgnoreScripts = process.env[IGNORE_SCRIPTS_ENV_VAR];

   beforeEach(() => {
      delete process.env[IGNORE_SCRIPTS_ENV_VAR];
      nypm.installs.length = 0;
      nypm.pendingInstalls.length = 0;
      nypm.failNextInstall = false;
      nypm.holdInstalls = false;
      tinyexec.commands.length = 0;
      tinyexec.exitCode = 0;
   });

   afterEach(() => {
      if (originalIgnoreScripts === undefined) {
         delete process.env[IGNORE_SCRIPTS_ENV_VAR];
      } else {
         process.env[IGNORE_SCRIPTS_ENV_VAR] = originalIgnoreScripts;
      }
   });

   it('installs a directory with npm and with lifecycle scripts ignored', async () => {
      await nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/config');

      expect(nypm.installs).toEqual([
         {
            options: { cwd: '/project/.aix/extends/config', silent: true, packageManager: 'npm' },
            ignoreScripts: 'true',
         },
      ]);
   });

   it('adds a package with npm and with lifecycle scripts ignored', async () => {
      await nodeRuntimeAdapter.npm.ensureDependencyInstalled('@acme/rules@^1.0.0', '/project/.aix/.tmp');

      expect(nypm.installs).toEqual([
         {
            options: { cwd: '/project/.aix/.tmp', packageManager: 'npm' },
            ignoreScripts: 'true',
         },
      ]);
   });

   it('removes the setting from the environment once the install is done', async () => {
      await nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/config');

      expect(process.env[IGNORE_SCRIPTS_ENV_VAR]).toBeUndefined();
   });

   it('restores a value the user had set, also when the install fails', async () => {
      process.env[IGNORE_SCRIPTS_ENV_VAR] = 'false';
      nypm.failNextInstall = true;

      await expect(nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/config')).rejects.toThrow(
         'npm install failed',
      );

      expect(nypm.installs[0]?.ignoreScripts).toBe('true');
      expect(process.env[IGNORE_SCRIPTS_ENV_VAR]).toBe('false');
   });

   it('keeps scripts ignored for an install that overlaps one that has finished', async () => {
      nypm.holdInstalls = true;

      const first = nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/first');

      await vi.waitFor(() => {
         expect(nypm.pendingInstalls).toHaveLength(1);
      });

      const second = nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/second');

      await vi.waitFor(() => {
         expect(nypm.pendingInstalls).toHaveLength(2);
      });

      nypm.pendingInstalls[0]?.();
      await first;

      const whileSecondRuns = process.env[IGNORE_SCRIPTS_ENV_VAR];

      nypm.pendingInstalls[1]?.();
      await second;

      expect(whileSecondRuns).toBe('true');
      expect(process.env[IGNORE_SCRIPTS_ENV_VAR]).toBeUndefined();
   });

   describe('running install scripts', () => {
      it('rebuilds only the named packages, with nothing after `--` read as an option', async () => {
         await nodeRuntimeAdapter.npm.rebuildPackages(['@acme/linter@1.2.0', '--ignore-scripts=false'], '/project/.aix/.tmp/config');

         expect(tinyexec.commands).toEqual([
            {
               command: 'npm',
               args: ['rebuild', '--', '@acme/linter@1.2.0', '--ignore-scripts=false'],
               options: { nodeOptions: { cwd: '/project/.aix/.tmp/config', env: {} } },
            },
         ]);
      });

      it('does not inherit the setting that a config install still in progress holds on', async () => {
         nypm.holdInstalls = true;

         const install = nodeRuntimeAdapter.npm.installDependencies('/project/.aix/extends/first');

         await vi.waitFor(() => {
            expect(nypm.pendingInstalls).toHaveLength(1);
         });

         await nodeRuntimeAdapter.npm.rebuildPackages(['@acme/linter'], '/project/.aix/.tmp/second');
         nypm.pendingInstalls[0]?.();
         await install;

         expect(tinyexec.commands[0]?.options).toEqual({
            nodeOptions: { cwd: '/project/.aix/.tmp/second', env: { [IGNORE_SCRIPTS_ENV_VAR]: 'false' } },
         });
      });

      it('fails with the output of npm when a script fails', async () => {
         tinyexec.exitCode = 1;

         await expect(nodeRuntimeAdapter.npm.rebuildPackages(['@acme/linter'], '/project/.aix/.tmp/config')).rejects.toThrow(
            'postinstall: download failed',
         );
      });
   });
});
