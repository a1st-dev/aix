import fs from 'node:fs';
import path from 'node:path';
import { listReleases, UNRELEASED, type CombinedRelease } from '../../../../scripts/changelog.mjs';

export const changelogPage = Object.freeze({
   title: 'Changelog',
   description: 'What changed in each release of the aix CLI and its library packages.',
   releasesURL: 'https://github.com/a1st-dev/aix/releases',
});

/**
 * The repository root, found from the working directory. The build bundles this module, so
 * its own location does not say where the changelogs are.
 */
function findRepositoryRoot(startDir: string): string {
   const parentDir = path.dirname(startDir);

   if (fs.existsSync(path.join(startDir, 'packages', 'cli', 'CHANGELOG.md'))) {
      return startDir;
   }
   if (parentDir === startDir) {
      throw new Error('Could not find the package changelogs above the working directory.');
   }
   return findRepositoryRoot(parentDir);
}

/** Every published release, newest first. Changes that are not released yet are left out. */
export function listPublishedReleases(): CombinedRelease[] {
   return listReleases(findRepositoryRoot(process.cwd())).filter((release) => {
      return release.version !== UNRELEASED;
   });
}

export function getReleaseURL(version: string): string {
   return `${changelogPage.releasesURL}/tag/v${version}`;
}

export function getReleaseAnchor(version: string): string {
   return `v${version.replaceAll('.', '-')}`;
}
