import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
   getEditorResearchRoot,
   getVisitorNote,
   groupEditorResearchEntries,
   listEditorResearchEntries,
} from './editor-research';

function writeResearchFile(options: {
   rootDir: string;
   editorID: string;
   version: string;
   timestamp: string;
   includeVersion?: boolean;
   fileName?: string;
   summary?: string;
}): void {
   const editorDir = path.join(options.rootDir, options.editorID);

   fs.mkdirSync(editorDir, { recursive: true });
   fs.writeFileSync(
      path.join(editorDir, `${options.fileName ?? options.version}.md`),
      [
         '---',
         `research_performed_at: "${options.timestamp}"`,
         `editor_id: "${options.editorID}"`,
         options.includeVersion === false ? '' : `editor_version: "${options.version}"`,
         'sources:',
         '   - "https://example.com/changelog"',
         '---',
         '',
         '## Changes affecting aix',
         '',
         `- ${options.summary ?? 'Added a config file.'}`,
         '  - aix status: needs follow-up before implementation.',
         '',
         '## Baseline evidence',
         '',
         '- Test fixture.',
         '',
      ].filter((line) => line.length > 0).join('\n'),
      'utf8',
   );
}

describe('editor research notes', () => {
   it('loads the seeded editor research documents', () => {
      const entries = listEditorResearchEntries(),
            editorIDs = new Set(entries.map((entry) => {
               return entry.editorID;
            }));

      expect(entries.length >= 8).toStrictEqual(true);
      expect(editorIDs.has('claude-code')).toStrictEqual(true);
      expect(editorIDs.has('codex')).toStrictEqual(true);
      expect(entries.every((entry) => {
         return entry.changes.length > 0;
      })).toStrictEqual(true);
   });

   it('resolves the default research root from the monorepo', () => {
      // Windows paths use backslashes, so match either separator.
      expect(getEditorResearchRoot()).toMatch(/docs[\\/]editor-research$/u);
      expect(fs.existsSync(getEditorResearchRoot())).toStrictEqual(true);
   });

   it('sorts entries by timestamp descending', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({
         rootDir,
         editorID: 'cursor',
         version: '3.4',
         timestamp: '2026-05-20T10:00:00-04:00',
      });
      writeResearchFile({
         rootDir,
         editorID: 'cursor',
         version: '3.5',
         timestamp: '2026-05-21T10:00:00-04:00',
      });

      const entries = listEditorResearchEntries(rootDir);

      expect(entries.map((entry) => {
         return entry.editorVersion;
      })).toEqual([ '3.5', '3.4' ]);
   });

   it('parses research files with CRLF line endings', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({
         rootDir,
         editorID: 'cursor',
         version: '3.5',
         timestamp: '2026-05-21T10:00:00-04:00',
      });

      const filePath = path.join(rootDir, 'cursor', '3.5.md'),
            crlfContent = fs.readFileSync(filePath, 'utf8').replace(/\n/gu, '\r\n');

      fs.writeFileSync(filePath, crlfContent, 'utf8');

      const entries = listEditorResearchEntries(rootDir);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.editorVersion).toStrictEqual('3.5');
      expect(entries[0]?.changes.length).toBeGreaterThan(0);
      expect(entries[0]?.changes[0]?.summary).toStrictEqual('Added a config file.');
   });

   it('extracts the aix status note and classifies its outcome', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      fs.mkdirSync(path.join(rootDir, 'cursor'), { recursive: true });
      fs.writeFileSync(
         path.join(rootDir, 'cursor', '3.5.md'),
         [
            '---',
            'research_performed_at: "2026-05-21T10:00:00-04:00"',
            'editor_id: "cursor"',
            'editor_version: "3.5"',
            'sources:',
            '   - "https://example.com/changelog"',
            '---',
            '',
            '## Changes affecting aix',
            '',
            '- Added a hook event.',
            '   - aix status: follow-up needed before implementation.',
            '- Renamed a settings key.',
            '   - aix status: no change needed, because aix does not write it.',
            '- Documented an existing path.',
            '   - aix status: addressed 2026-05-21 in the Cursor strategy.',
            '- Shipped something unclassifiable.',
            '   - aix status: use 3.5 as the checked package version.',
            '',
         ].join('\n'),
         'utf8',
      );

      const [ entry ] = listEditorResearchEntries(rootDir);

      expect(entry?.changes.map((change) => {
         return change.status;
      })).toEqual([ 'follow-up', 'no-change', 'supported', 'unknown' ]);
      expect(entry?.changes[1]?.aixStatus).toStrictEqual(
         'no change needed, because aix does not write it.',
      );
   });

   it('classifies the short verdicts the notes use', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      fs.mkdirSync(path.join(rootDir, 'cursor'), { recursive: true });
      fs.writeFileSync(
         path.join(rootDir, 'cursor', '3.5.md'),
         [
            '---',
            'research_performed_at: "2026-05-21T10:00:00-04:00"',
            'editor_id: "cursor"',
            'editor_version: "3.5"',
            '---',
            '',
            '## Changes affecting aix',
            '',
            '- Hardened MCP tool calls.',
            '   - aix status: supported. aix writes standard MCP definitions.',
            '- Reworked rule discovery.',
            '   - aix status: already addressed in an earlier review.',
            '- Added per-agent model lists.',
            '   - aix status: partial. aix models the field as a single string.',
            '- Added output token limits.',
            '   - aix status: not applicable. aix does not write that setting.',
            '',
         ].join('\n'),
         'utf8',
      );

      const [ entry ] = listEditorResearchEntries(rootDir);

      expect(entry?.changes.map((change) => {
         return change.status;
      })).toEqual([ 'supported', 'supported', 'follow-up', 'no-change' ]);
   });

   it('joins bullet text that wraps across lines', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      fs.mkdirSync(path.join(rootDir, 'cursor'), { recursive: true });
      fs.writeFileSync(
         path.join(rootDir, 'cursor', '3.6.md'),
         [
            '---',
            'research_performed_at: "2026-05-21T10:00:00-04:00"',
            'editor_id: "cursor"',
            'editor_version: "3.6"',
            'sources:',
            '   - "https://example.com/changelog"',
            '---',
            '',
            '## Changes affecting aix',
            '',
            '- Added a hook event that fires after the editor registers a new working',
            '  directory mid-session.',
            '   - aix status: no change needed, because the event has no generic',
            '     equivalent in ai.json yet.',
            '   - A nested bullet is extra detail, not part of either field.',
            '',
         ].join('\n'),
         'utf8',
      );

      const [ entry ] = listEditorResearchEntries(rootDir),
            [ change ] = entry?.changes ?? [];

      expect(change?.summary).toStrictEqual(
         'Added a hook event that fires after the editor registers a new working directory mid-session.',
      );
      expect(change?.aixStatus).toStrictEqual(
         'no change needed, because the event has no generic equivalent in ai.json yet.',
      );
   });

   it('rejects notes missing required frontmatter fields', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({
         rootDir,
         editorID: 'cursor',
         version: '3.5',
         timestamp: '2026-05-21T10:00:00-04:00',
         includeVersion: false,
      });

      expect(() => listEditorResearchEntries(rootDir)).to.throw('Missing required frontmatter field: editor_version');
   });
});

describe('visitor-facing status notes', () => {
   it('drops the opening verdict and keeps the explanation', () => {
      const note = getVisitorNote('no change needed. aix writes static `headers` into MCP config.');

      expect(note).toStrictEqual('aix writes static `headers` into MCP config.');
   });

   it('keeps an opening sentence that explains something', () => {
      const note = getVisitorNote('no change needed, because aix does not write that settings key at all.');

      expect(note).toStrictEqual('No change needed, because aix does not write that settings key at all.');
   });

   it('drops sentences that point into the aix source tree', () => {
      const note = getVisitorNote([
         'already supported.',
         'Prompts are converted into skills under `.agents/skills/`.',
         'See `packages/core/src/editors/adapters/antigravity.ts`.',
         '`AntigravityPromptsStrategy` reports prompts as unsupported.',
      ].join(' '));

      expect(note).toStrictEqual('Prompts are converted into skills under `.agents/skills/`.');
   });

   it('returns an empty string when only a verdict was recorded', () => {
      const note = getVisitorNote('verified 2026-07-19, no change needed.');

      expect(note).toStrictEqual('');
   });

   it('does not split file paths or version numbers into sentences', () => {
      const note = getVisitorNote('supported. aix writes `~/.gemini/settings.json` for release 0.66.0 and later.');

      expect(note).toStrictEqual('aix writes `~/.gemini/settings.json` for release 0.66.0 and later.');
   });
});

describe('editor research groups', () => {
   it('groups releases by editor in the requested order', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({ rootDir, editorID: 'zed', version: '1.2', timestamp: '2026-05-21T10:00:00-04:00' });
      writeResearchFile({ rootDir, editorID: 'cursor', version: '3.4', timestamp: '2026-05-20T10:00:00-04:00' });
      writeResearchFile({ rootDir, editorID: 'cursor', version: '3.5', timestamp: '2026-05-22T10:00:00-04:00' });

      const groups = groupEditorResearchEntries(listEditorResearchEntries(rootDir), [ 'cursor', 'zed', 'codex' ]);

      expect(groups.map((group) => {
         return group.editorName;
      })).toEqual([ 'Cursor', 'Zed' ]);
      expect(groups[0]?.releases.map((release) => {
         return release.heading;
      })).toEqual([ 'Cursor 3.5', 'Cursor 3.4' ]);
      expect(groups[0]?.releases[0]?.anchor).toStrictEqual('cursor-3-5');
      expect(groups[0]?.releases[0]?.statusCounts['follow-up']).toStrictEqual(1);
   });

   it('adds the review date when several notes cover the same version', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({ rootDir, editorID: 'cursor', version: '3.11', timestamp: '2026-07-19T10:00:00-04:00' });
      writeResearchFile({
         rootDir,
         editorID: 'cursor',
         version: '3.11',
         timestamp: '2026-08-24T23:30:00-04:00',
         fileName: '2026-08-24',
      });

      const [ group ] = groupEditorResearchEntries(listEditorResearchEntries(rootDir)),
            headings = group?.releases.map((release) => {
               return release.heading;
            }),
            anchors = group?.releases.map((release) => {
               return release.anchor;
            });

      expect(headings).toEqual([ 'Cursor 3.11, reviewed Aug 24, 2026', 'Cursor 3.11, reviewed Jul 19, 2026' ]);
      expect(anchors).toEqual([ 'cursor-3-11-2026-08-24', 'cursor-3-11-2026-07-19' ]);
   });

   it('titles a note with the upstream product only when the note is about that product', () => {
      const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aix-editor-research-'));

      writeResearchFile({
         rootDir,
         editorID: 'antigravity',
         version: '0.66.0',
         timestamp: '2026-11-04T10:00:00-05:00',
         summary: 'Gemini CLI 0.66.0 added a setting.',
      });
      writeResearchFile({
         rootDir,
         editorID: 'antigravity',
         version: '2.0.0',
         timestamp: '2026-10-01T10:00:00-04:00',
         summary: 'Google Antigravity deprecated workflows.',
      });

      const [ group ] = groupEditorResearchEntries(listEditorResearchEntries(rootDir));

      expect(group?.releases.map((release) => {
         return release.heading;
      })).toEqual([ 'Gemini CLI 0.66.0', 'Google Antigravity 2.0.0' ]);
   });

   it('gives every seeded release a unique heading and anchor', () => {
      const releases = groupEditorResearchEntries(listEditorResearchEntries()).flatMap((group) => {
               return group.releases;
            }),
            headings = new Set(releases.map((release) => {
               return release.heading;
            })),
            anchors = new Set(releases.map((release) => {
               return release.anchor;
            }));

      expect(headings.size).toStrictEqual(releases.length);
      expect(anchors.size).toStrictEqual(releases.length);
   });
});
