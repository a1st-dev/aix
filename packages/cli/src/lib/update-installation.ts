import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isRecord } from '@a1st/aix-core';
import { compareVersions, validateStrict } from 'compare-versions';
import { x } from 'tinyexec';

const PACKAGE_NAME = '@a1st/aix',
      FORMULA_NAME = 'aix',
      CHECK_TIMEOUT_MS = 10_000,
      TAP_NAME = /^[a-z\d][\w.-]*\/[a-z\d][\w.-]*$/i,
      // An update is for this installed CLI, so project-local shims must not choose the manager.
      managerOptions = { nodePath: false, nodeOptions: { cwd: dirname(process.execPath) } },
      brewCheckOptions = {
         ...managerOptions,
         timeout: CHECK_TIMEOUT_MS,
         nodeOptions: { ...managerOptions.nodeOptions, env: { HOMEBREW_NO_AUTO_UPDATE: '1' } },
      };

export type UpdateInstallation = { manager: 'npm' } | { manager: 'brew'; formula: string; kegVersion: string };

export interface AvailableUpdate {
   version: string;
   pinned?: boolean;
}

async function getBrewInstallation(root: string): Promise<UpdateInstallation | undefined> {
   try {
      const { stdout } = await x('brew', ['--cellar'], { ...brewCheckOptions, throwOnError: true }),
            cellar = await realpath(stdout.trim()),
            [ formula, kegVersion ] = relative(cellar, root).split(sep);

      if (formula !== FORMULA_NAME || !kegVersion) {
         return undefined;
      }

      const receipt: unknown = JSON.parse(await readFile(join(cellar, formula, kegVersion, 'INSTALL_RECEIPT.json'), 'utf8')),
            tap = isRecord(receipt) && isRecord(receipt.source) ? receipt.source.tap : undefined;

      if (typeof tap === 'string' && TAP_NAME.test(tap)) {
         return { manager: 'brew', formula: `${tap}/${formula}`, kegVersion };
      }
   } catch {
      // A missing Brew executable or receipt does not establish Homebrew ownership.
   }

   return undefined;
}

export async function getUpdateInstallation(root: string): Promise<UpdateInstallation | undefined> {
   const packageRoot = await realpath(root),
         brew = process.platform === 'win32' ? undefined : await getBrewInstallation(packageRoot);

   if (brew) {
      return brew;
   }

   try {
      const { stdout } = await x('npm', ['root', '--global'], {
               ...managerOptions,
               timeout: CHECK_TIMEOUT_MS,
               throwOnError: true,
            }),
            globalRoot = stdout.trim();

      if (!isAbsolute(globalRoot)) {
         return undefined;
      }

      const globalPackage = join(globalRoot, PACKAGE_NAME),
            installed = await lstat(globalPackage);

      // A global npm link points to a development checkout or a different installation.
      if (installed.isDirectory() && await realpath(globalPackage) === packageRoot) {
         return { manager: 'npm' };
      }
   } catch {
      // The active npm prefix does not contain a verifiable install of this copy.
   }

   return undefined;
}

async function checkBrewUpdate(
   installation: Extract<UpdateInstallation, { manager: 'brew' }>,
   refresh: boolean,
): Promise<AvailableUpdate | undefined> {
   if (refresh) {
      await x('brew', ['update'], { ...managerOptions, throwOnError: true });
   }

   const { exitCode, stdout, stderr } = await x('brew', [
            'outdated', '--json=v2', '--formula', installation.formula,
         ], brewCheckOptions),
         result: unknown = readBrewStatus(stdout, stderr);

   // With a named formula, Brew returns exit code 1 when it finds an outdated keg.
   if ((exitCode !== 0 && exitCode !== 1) || !isRecord(result) || !Array.isArray(result.formulae)) {
      throw new Error(stderr.trim() || 'Homebrew did not return an update status.');
   }

   const formula = result.formulae.find((entry: unknown) => {
      return isRecord(entry) && Array.isArray(entry.installed_versions) && entry.installed_versions.includes(installation.kegVersion);
   });

   if (isRecord(formula) && typeof formula.current_version === 'string') {
      return { version: formula.current_version, pinned: formula.pinned === true };
   }

   return undefined;
}

function readBrewStatus(stdout: string, stderr: string): unknown {
   try {
      return JSON.parse(stdout);
   } catch {
      throw new Error(stderr.trim() || 'Homebrew did not return an update status.');
   }
}

export async function checkForCLIUpdate(
   installation: UpdateInstallation,
   currentVersion: string,
   refresh = false,
): Promise<AvailableUpdate | undefined> {
   if (installation.manager === 'brew') {
      return checkBrewUpdate(installation, refresh);
   }

   const { stdout } = await x('npm', ['view', `${PACKAGE_NAME}@latest`, 'version', '--json', '--global'], {
            ...managerOptions,
            timeout: CHECK_TIMEOUT_MS,
            throwOnError: true,
         }),
         version: unknown = JSON.parse(stdout);

   if (typeof version !== 'string' || !validateStrict(version)) {
      throw new Error('npm did not return a valid aix version.');
   }

   return compareVersions(version, currentVersion) > 0 ? { version } : undefined;
}

export async function applyCLIUpdate(installation: UpdateInstallation, update: AvailableUpdate, json: boolean): Promise<void> {
   const args = installation.manager === 'brew'
      ? ['upgrade', '--formula', installation.formula]
      : ['install', '--global', `${PACKAGE_NAME}@${update.version}`];

   await x(installation.manager, args, {
      ...managerOptions,
      throwOnError: true,
      nodeOptions: { ...managerOptions.nodeOptions, stdio: json ? 'pipe' : 'inherit' },
   });
}
