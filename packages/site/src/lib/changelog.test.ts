import { describe, expect, it } from 'vitest';
import { formatReleaseNotes, parseChangelog, rollUnreleased, UNRELEASED } from '../../../../scripts/changelog.mjs';

const CHANGELOG = [
   '# Changelog',
   '',
   '## [Unreleased]',
   '',
   '### Added',
   '',
   '- Add `installItem`, which installs',
   '  one item',
   '',
   '### Fixed',
   '',
   '- Keep comments',
   '',
   '## [0.1.0] - 2026-04-26',
   '',
   '- No changes',
   '',
].join('\n');

describe('parseChangelog', () => {
   it('joins a wrapped entry and reads a release without changes as empty', () => {
      const releases = parseChangelog(CHANGELOG);

      expect(releases).toEqual([
         {
            version: UNRELEASED,
            groups: [
               { title: 'Added', entries: [ 'Add `installItem`, which installs one item' ] },
               { title: 'Fixed', entries: [ 'Keep comments' ] },
            ],
         },
         { version: '0.1.0', date: '2026-04-26', groups: [] },
      ]);
   });
});

describe('rollUnreleased', () => {
   it('moves the unreleased entries under the new version', () => {
      const [ unreleased, released ] = parseChangelog(rollUnreleased(CHANGELOG, '0.2.0', '2026-05-08'));

      expect(unreleased).toEqual({ version: UNRELEASED, groups: [] });
      expect(released?.version).toBe('0.2.0');
      expect(released?.date).toBe('2026-05-08');
      expect(released?.groups.map((group) => group.title)).toEqual([ 'Added', 'Fixed' ]);
   });

   it('marks a release that has no entries', () => {
      const rolled = rollUnreleased(rollUnreleased(CHANGELOG, '0.2.0', '2026-05-08'), '0.3.0', '2026-05-09');

      expect(rolled).toContain('## [0.3.0] - 2026-05-09\n\n- No changes\n\n## [0.2.0] - 2026-05-08');
   });

   it('refuses a version that already has a section', () => {
      expect(() => rollUnreleased(CHANGELOG, '0.1.0', '2026-05-08')).toThrow('already exists');
   });
});

describe('formatReleaseNotes', () => {
   it('lists each package with its groups', () => {
      const notes = formatReleaseNotes({
         version: '0.2.0',
         packages: [ { name: '@a1st/aix', groups: [ { title: 'Fixed', entries: [ 'Keep comments' ] } ] } ],
      });

      expect(notes).toBe('## `@a1st/aix`\n\n### Fixed\n\n- Keep comments\n');
   });
});
