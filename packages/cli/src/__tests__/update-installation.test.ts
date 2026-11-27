import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { x } from 'tinyexec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCLIUpdate, checkForCLIUpdate, getUpdateInstallation } from '../lib/update-installation.js';

vi.mock('tinyexec', () => {
   return { x: vi.fn() };
});

const exec = vi.mocked(x);
let sandbox: string;

beforeEach(async () => {
   sandbox = await realpath(await mkdtemp(join(tmpdir(), 'aix-updater-')));
   exec.mockReset();
});

afterEach(async () => {
   await rm(sandbox, { recursive: true, force: true });
});

describe('updating an npm installation', () => {
   it('only treats the running copy under the active global prefix as owned by npm', async () => {
      const globalRoot = join(sandbox, 'global'),
            globalPackage = join(globalRoot, '@a1st', 'aix'),
            otherCopy = join(sandbox, 'project', 'node_modules', '@a1st', 'aix');

      await Promise.all([
         mkdir(globalPackage, { recursive: true }),
         mkdir(otherCopy, { recursive: true }),
      ]);
      exec.mockResolvedValue({ exitCode: 0, stdout: globalRoot, stderr: '' });

      const global = await getUpdateInstallation(globalPackage),
            local = await getUpdateInstallation(otherCopy);

      expect(global).toEqual({ manager: 'npm' });
      expect(local).toBeUndefined();
   });

   it('uses npm for lookup and installs the checked version', async () => {
      const installation = { manager: 'npm' } as const;

      exec.mockResolvedValueOnce({ exitCode: 0, stdout: '"1.1.0"', stderr: '' });
      exec.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

      const update = await checkForCLIUpdate(installation, '1.0.0');

      expect(update).toEqual({ version: '1.1.0' });

      if (update) {
         await applyCLIUpdate(installation, update, true);
      }

      expect(exec).toHaveBeenNthCalledWith(1, 'npm', ['view', '@a1st/aix@latest', 'version', '--json', '--global'], expect.any(Object));
      expect(exec).toHaveBeenNthCalledWith(2, 'npm', ['install', '--global', '@a1st/aix@1.1.0'], expect.any(Object));
   });
});

describe.skipIf(process.platform === 'win32')('updating a Homebrew installation', () => {
   it('takes the tap from the running keg and honors Homebrew’s outdated exit status', async () => {
      const cellar = join(sandbox, 'Cellar'),
            keg = join(cellar, 'aix', '1.0.0'),
            packageRoot = join(keg, 'libexec');

      await mkdir(packageRoot, { recursive: true });
      await writeFile(join(keg, 'INSTALL_RECEIPT.json'), JSON.stringify({ source: { tap: 'a1st/tools' } }));
      exec.mockResolvedValueOnce({ exitCode: 0, stdout: cellar, stderr: '' });
      exec.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
      exec.mockResolvedValueOnce({
         exitCode: 1,
         stdout: JSON.stringify({
            formulae: [{ name: 'a1st/tools/aix', installed_versions: ['1.0.0'], current_version: '1.0.0_1', pinned: false }],
         }),
         stderr: '',
      });
      exec.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

      const installation = await getUpdateInstallation(packageRoot);

      expect(installation).toEqual({ manager: 'brew', formula: 'a1st/tools/aix', kegVersion: '1.0.0' });

      if (installation) {
         const update = await checkForCLIUpdate(installation, '1.0.0', true);

         expect(update).toEqual({ version: '1.0.0_1', pinned: false });

         if (update) {
            await applyCLIUpdate(installation, update, true);
         }
      }

      expect(exec).toHaveBeenNthCalledWith(2, 'brew', ['update'], expect.any(Object));
      expect(exec).toHaveBeenNthCalledWith(4, 'brew', ['upgrade', '--formula', 'a1st/tools/aix'], expect.any(Object));
   });
});
