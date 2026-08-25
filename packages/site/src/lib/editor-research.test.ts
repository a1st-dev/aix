import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEditorResearchRoot, listEditorResearchEntries } from './editor-research';

function writeResearchFile(options: {
   rootDir: string;
   editorID: string;
   version: string;
   timestamp: string;
   includeVersion?: boolean;
}): void {
   const editorDir = path.join(options.rootDir, options.editorID);

   fs.mkdirSync(editorDir, { recursive: true });
   fs.writeFileSync(
      path.join(editorDir, `${options.version}.md`),
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
         '- Added a config file.',
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
