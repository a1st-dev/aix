import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, it, expect } from 'vitest';
import { runCommand } from '@oclif/test';

const testDirname = dirname(fileURLToPath(import.meta.url)),
      root = join(testDirname, '../..'),
      loadOpts = { root, devPlugins: false };
const runCli = (args: string[] | string) =>
   runCommand(args, loadOpts, { testNodeEnv: 'production' });

describe('aix CLI', () => {
   it('shows help', async () => {
      const { stdout } = await runCli(['--help']);

      expect(stdout).toContain('aix');
   });

   it('shows version', async () => {
      const { stdout } = await runCli(['--version']);

      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
   });

   it('suggests similar commands for unknown commands', async () => {
      const { error } = await runCli(['validat']);

      // The not-found plugin should produce an error for unknown commands
      expect(error).toBeDefined();
   });
});

describe('aixd', () => {
   it('runs workspace source from another directory without builds or a current manifest', async () => {
      const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'aixd-'))),
            checkout = join(sandbox, 'checkout with spaces'),
            project = join(sandbox, 'project'),
            repoRoot = join(root, '../..'),
            run = promisify(execFile);

      try {
         await mkdir(checkout);
         await mkdir(project);
         await mkdir(join(checkout, 'node_modules', '@a1st'), { recursive: true });
         await cp(join(repoRoot, 'tsconfig.json'), join(checkout, 'tsconfig.json'));

         const dependencies = await readdir(join(repoRoot, 'node_modules'));

         await Promise.all(dependencies.filter((name) => {
            return name !== '@a1st';
         }).map((name) => {
            return symlink(join(repoRoot, 'node_modules', name), join(checkout, 'node_modules', name), 'junction');
         }));

         const packages = { cli: 'aix', core: 'aix-core', schema: 'aix-schema', 'mcp-registry-client': 'mcp-registry-client' };

         await Promise.all(Object.entries(packages).map(async function copyPackage([ name, packageName ]): Promise<void> {
            const source = join(repoRoot, 'packages', name),
                  destination = join(checkout, 'packages', name);

            await cp(join(source, 'src'), join(destination, 'src'), { recursive: true });
            await Promise.all([
               cp(join(source, 'package.json'), join(destination, 'package.json')),
               symlink(destination, join(checkout, 'node_modules', '@a1st', packageName), 'junction'),
            ]);
         }));

         const cliRoot = join(checkout, 'packages', 'cli');

         await Promise.all([ 'bin', 'tsconfig.json', 'theme.json', 'tsconfig.dev.json' ].map((name) => {
            return cp(join(root, name), join(cliRoot, name), { recursive: true });
         }));

         await writeFile(join(cliRoot, 'oclif.manifest.json'), JSON.stringify({ version: '0.0.0', commands: {} }));
         await writeFile(join(project, 'ai.json'), JSON.stringify({ version: '1.0' }));

         const env = { ...process.env, HOME: sandbox, AIX_DISABLE_AUTOUPDATE: '1' },
               launcher = join(cliRoot, 'bin', 'aixd.mjs'),
               help = await run(process.execPath, [ launcher, '--help' ], { cwd: project, env }),
               validation = await run(process.execPath, [ launcher, 'validate', '--json' ], { cwd: project, env });

         expect(help.stdout).toContain('validate');
         expect(JSON.parse(validation.stdout)).toMatchObject({ valid: true, path: join(project, 'ai.json') });
      } finally {
         await rm(sandbox, { recursive: true, force: true });
      }
   });
});
