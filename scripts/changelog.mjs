#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{ title: string, entries: string[] }} ChangeGroup
 * @typedef {{ version: string, date?: string, groups: ChangeGroup[] }} ChangelogRelease
 * @typedef {{ name: string, groups: ChangeGroup[] }} PackageChanges
 * @typedef {{ version: string, date?: string, packages: PackageChanges[] }} CombinedRelease
 * @typedef {{ name: string, changelogPath: string }} ChangelogPackage
 */

export const UNRELEASED = 'Unreleased';

const RELEASE_HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/,
      GROUP_HEADING = /^### (.+?)\s*$/,
      ENTRY_START = /^- (.*)$/,
      // A placeholder entry for a release that did not change the package.
      NO_CHANGES = /^no changes$/i,
      CLI_PACKAGE = '@a1st/aix',
      repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getUnreleasedHeading() {
   return `## [${UNRELEASED}]`;
}

/**
 * @param {ChangelogRelease[]} releases
 * @param {string} version
 * @returns {ChangelogRelease | undefined}
 */
function getRelease(releases, version) {
   return releases.find((release) => {
      return release.version === version;
   });
}

/**
 * @param {string} entry
 * @returns {string}
 */
function formatEntry(entry) {
   return `- ${entry}`;
}

/**
 * Read one changelog into its releases, newest first, in the order the file lists them. An
 * entry that wraps over several lines becomes one string.
 *
 * @param {string} content
 * @returns {ChangelogRelease[]}
 */
export function parseChangelog(content) {
   /** @type {ChangelogRelease[]} */
   const releases = [];

   /** @type {ChangeGroup | undefined} */
   let group;

   for (const line of content.split(/\r?\n/)) {
      const releaseMatch = line.match(RELEASE_HEADING),
            groupMatch = line.match(GROUP_HEADING),
            entryMatch = line.match(ENTRY_START),
            release = releases.at(-1);

      if (releaseMatch) {
         releases.push({ version: releaseMatch[1], ...(releaseMatch[2] ? { date: releaseMatch[2] } : {}), groups: [] });
         group = undefined;
      } else if (!release) {
         continue;
      } else if (groupMatch) {
         group = { title: groupMatch[1], entries: [] };
         release.groups.push(group);
      } else if (entryMatch && NO_CHANGES.test(entryMatch[1].trim())) {
         continue;
      } else if (entryMatch) {
         if (!group) {
            group = { title: '', entries: [] };
            release.groups.push(group);
         }
         group.entries.push(entryMatch[1].trim());
      } else if (line.trim() && group && group.entries.length > 0) {
         group.entries[group.entries.length - 1] += ` ${line.trim()}`;
      }
   }

   return releases;
}

/**
 * Turn the Unreleased section into the section for `version`, and start an empty Unreleased
 * section above it.
 *
 * @param {string} content
 * @param {string} version
 * @param {string} date ISO date, such as 2026-11-25
 * @returns {string}
 */
export function rollUnreleased(content, version, date) {
   const releases = parseChangelog(content),
         unreleased = getRelease(releases, UNRELEASED),
         heading = getUnreleasedHeading();

   if (!unreleased) {
      throw new Error(`No "${heading}" section to turn into ${version}.`);
   }
   if (getRelease(releases, version)) {
      throw new Error(`A section for ${version} already exists.`);
   }

   const placeholder = unreleased.groups.length === 0 ? '\n\n- No changes' : '';

   return content.replace(heading, `${heading}\n\n## [${version}] - ${date}${placeholder}`);
}

/**
 * The published packages that keep a changelog, with the CLI first.
 *
 * @param {string} [rootDir]
 * @returns {ChangelogPackage[]}
 */
export function listChangelogPackages(rootDir = repoRoot) {
   const packagesDir = path.join(rootDir, 'packages');

   return fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => {
         return entry.isDirectory() && fs.existsSync(path.join(packagesDir, entry.name, 'CHANGELOG.md'));
      })
      .map((entry) => {
         const packageDir = path.join(packagesDir, entry.name),
               { name } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

         return { name: String(name), changelogPath: path.join(packageDir, 'CHANGELOG.md') };
      })
      .toSorted((a, b) => {
         if (a.name === CLI_PACKAGE || b.name === CLI_PACKAGE) {
            return a.name === CLI_PACKAGE ? -1 : 1;
         }
         return a.name.localeCompare(b.name);
      });
}

/**
 * Every release with the changes of each package, newest first. The packages are released
 * together, so each changelog lists the same versions. A package with nothing recorded for
 * a release is left out of that release.
 *
 * @param {string} [rootDir]
 * @returns {CombinedRelease[]}
 */
export function listReleases(rootDir = repoRoot) {
   /** @type {Map<string, CombinedRelease>} */
   const combined = new Map();

   for (const changelogPackage of listChangelogPackages(rootDir)) {
      for (const release of parseChangelog(fs.readFileSync(changelogPackage.changelogPath, 'utf8'))) {
         const existing = combined.get(release.version) ?? { version: release.version, date: release.date, packages: [] };

         if (release.groups.length > 0) {
            existing.packages.push({ name: changelogPackage.name, groups: release.groups });
         }
         combined.set(release.version, existing);
      }
   }

   return [ ...combined.values() ];
}

/**
 * The Markdown body of one release, for the GitHub Release.
 *
 * @param {CombinedRelease} release
 * @returns {string}
 */
export function formatReleaseNotes(release) {
   if (release.packages.length === 0) {
      return 'No changes were recorded for this release.\n';
   }

   const sections = release.packages.map((changes) => {
      const groups = changes.groups.map((group) => {
         const entries = group.entries.map(formatEntry).join('\n');

         return group.title ? `### ${group.title}\n\n${entries}` : entries;
      });

      return [ `## \`${changes.name}\``, ...groups ].join('\n\n');
   });

   return `${sections.join('\n\n')}\n`;
}

/**
 * The packages whose changelog is not ready for a release of `version`: no section for it,
 * or entries still under Unreleased.
 *
 * @param {string} version
 * @param {string} [rootDir]
 * @returns {string[]} one problem per line, empty when every changelog is ready
 */
export function listUnreleasedProblems(version, rootDir = repoRoot) {
   /** @type {string[]} */
   const problems = [];

   for (const changelogPackage of listChangelogPackages(rootDir)) {
      const releases = parseChangelog(fs.readFileSync(changelogPackage.changelogPath, 'utf8')),
            relativePath = path.relative(rootDir, changelogPackage.changelogPath),
            unreleased = getRelease(releases, UNRELEASED);

      if (!getRelease(releases, version)) {
         problems.push(`${relativePath}: no "## [${version}]" section`);
      }
      if (unreleased && unreleased.groups.length > 0) {
         problems.push(`${relativePath}: entries are still under "${getUnreleasedHeading()}"`);
      }
   }

   return problems;
}

function printReleaseNotes(version) {
   const release = listReleases().find((candidate) => {
      return candidate.version === version;
   });

   if (!release) {
      console.error(`No changelog has a section for ${version}.`);
      process.exit(1);
   }

   process.stdout.write(formatReleaseNotes(release));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
   const [ command, version ] = process.argv.slice(2);

   if (command !== 'notes' || !version) {
      console.error('Usage: node ./scripts/changelog.mjs notes <version>');
      process.exit(1);
   }

   printReleaseNotes(version);
}
