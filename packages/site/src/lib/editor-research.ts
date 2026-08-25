import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { supportedEditorNames, type SupportedEditorName } from '@a1st/aix-schema';

export type EditorResearchStatus = 'supported' | 'follow-up' | 'no-change' | 'unknown';

export interface EditorResearchChange {
   summary: string;
   aixStatus: string;
   status: EditorResearchStatus;
}

export interface EditorResearchEntry {
   researchPerformedAt: string;
   editorID: SupportedEditorName;
   editorVersion: string;
   sourceURLs: string[];
   body: string;
   changes: EditorResearchChange[];
   absolutePath: string;
   relativePath: string;
}

interface ParsedResearchFile {
   frontmatter: unknown;
   body: string;
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const researchRoot = findEditorResearchRoot([process.cwd(), moduleDirectory]);
const supportedEditorNameSet: ReadonlySet<string> = new Set(supportedEditorNames);

function findEditorResearchRoot(startDirs: readonly string[]): string {
   for (const startDir of startDirs) {
      const found = findAncestorEditorResearchRoot(startDir);

      if (found) {
         return found;
      }
   }

   return path.resolve(process.cwd(), 'docs', 'editor-research');
}

function findAncestorEditorResearchRoot(startDir: string): string | null {
   let currentDir = path.resolve(startDir);

   while (true) {
      const candidate = path.join(currentDir, 'docs', 'editor-research');

      if (fs.existsSync(candidate)) {
         return candidate;
      }

      const parentDir = path.dirname(currentDir);

      if (parentDir === currentDir) {
         return null;
      }

      currentDir = parentDir;
   }
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSupportedEditorName(value: unknown): value is SupportedEditorName {
   return typeof value === 'string' && supportedEditorNameSet.has(value);
}

function parseResearchFileContent(content: string): ParsedResearchFile {
   // Windows checkouts without .gitattributes produce CRLF files; normalize so the
   // frontmatter delimiter and line-based change parsing behave identically everywhere.
   const normalized = content.replace(/\r\n/gu, '\n'),
         frontmatterMatch = /^---\n(?<frontmatter>[\s\S]*?)\n---\n?(?<body>[\s\S]*)$/u.exec(normalized);

   if (!frontmatterMatch?.groups) {
      throw new Error('Missing YAML frontmatter');
   }

   return {
      frontmatter: YAML.parse(frontmatterMatch.groups.frontmatter),
      body: frontmatterMatch.groups.body.trim(),
   };
}

function requireStringField(frontmatter: Record<string, unknown>, fieldName: string): string {
   const value = frontmatter[fieldName];

   if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing required frontmatter field: ${fieldName}`);
   }

   return value;
}

function listStringField(frontmatter: Record<string, unknown>, fieldName: string): string[] {
   const value = frontmatter[fieldName];

   if (value === undefined) {
      return [];
   }
   if (!Array.isArray(value) || !value.every((entry) => {
      return typeof entry === 'string';
   })) {
      throw new Error(`Expected ${fieldName} to be a string array`);
   }

   return value;
}

function getChangesSection(body: string): string {
   const startMarker = '## Changes affecting aix',
         startIndex = body.indexOf(startMarker);

   if (startIndex === -1) {
      return '';
   }

   const sectionStart = startIndex + startMarker.length,
         sectionRest = body.slice(sectionStart),
         nextSectionIndex = sectionRest.indexOf('\n## ');

   return nextSectionIndex === -1 ? sectionRest : sectionRest.slice(0, nextSectionIndex);
}

/**
 * Phrases the research documents actually open an `aix status:` bullet with, in the order
 * they must be tested. Ordering matters: "addressed ... no config change" is work that
 * happened, not an absence of work, so the outcome patterns are checked before the
 * no-change ones.
 */
const STATUS_PATTERNS: readonly { pattern: RegExp; status: EditorResearchStatus }[] = [
   // "partially addressed" leaves work outstanding, so it reads as follow-up, not done.
   { pattern: /follow-up needed|needs follow-up|follow-up worth|partially addressed/u, status: 'follow-up' },
   { pattern: /^(addressed|fixed|verified)\b|already (supported|aligned|exposes|partly aligned)/u, status: 'supported' },
   // Covers the whole "no <something> change" family: "no change needed", "no generated
   // config change", "no current implementation change", and the rest.
   { pattern: /\bno\b[^.]{0,40}\bchange\b/u, status: 'no-change' },
];

function classifyStatus(aixStatus: string): EditorResearchStatus {
   const normalized = aixStatus.toLowerCase(),
         match = STATUS_PATTERNS.find((candidate) => {
            return candidate.pattern.test(normalized);
         });

   return match ? match.status : 'unknown';
}

const AIX_STATUS_PREFIX = '- aix status:';

/**
 * Read the `## Changes affecting aix` section into one entry per top-level bullet.
 *
 * The documents wrap prose to the repository's line length, so a bullet's text routinely
 * continues on the following lines. Those continuation lines are part of the sentence and
 * are joined back on; without that, every wrapped summary and status ends mid-clause.
 * A continuation is any non-empty line that is not itself a bullet, and it belongs to
 * whichever field is currently open. A nested bullet other than `aix status:` is extra
 * detail rather than part of either field, so it closes the open one.
 */
function parseChanges(body: string): EditorResearchChange[] {
   const lines = getChangesSection(body).split('\n'),
         changes: EditorResearchChange[] = [];
   let current: EditorResearchChange | undefined,
       openField: 'summary' | 'aixStatus' | undefined;

   function append(field: 'summary' | 'aixStatus', text: string): void {
      if (!current) {
         return;
      }
      current[field] = `${current[field]} ${text}`.trim();
   }

   for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.length === 0) {
         openField = undefined;
         continue;
      }

      if (line.startsWith('- ')) {
         if (current) {
            changes.push(current);
         }

         current = {
            summary: trimmed.slice(2).trim(),
            aixStatus: 'No aix status recorded.',
            status: 'unknown',
         };
         openField = 'summary';
         continue;
      }

      if (current && trimmed.toLowerCase().startsWith(AIX_STATUS_PREFIX)) {
         current.aixStatus = trimmed.slice(AIX_STATUS_PREFIX.length).trim();
         openField = 'aixStatus';
         continue;
      }

      if (trimmed.startsWith('- ')) {
         openField = undefined;
         continue;
      }

      if (openField) {
         append(openField, trimmed);
      }
   }

   if (current) {
      changes.push(current);
   }

   // Classified only after the loop, because continuation lines can still be appended to
   // `aixStatus` after its first line is read.
   for (const change of changes) {
      change.status = classifyStatus(change.aixStatus);
   }

   return changes;
}

function listMarkdownFiles(directory: string): string[] {
   if (!fs.existsSync(directory)) {
      return [];
   }

   return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const childPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
         return listMarkdownFiles(childPath);
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
         return [ childPath ];
      }

      return [];
   });
}

function parseEditorResearchFile(filePath: string, rootDir: string): EditorResearchEntry {
   const content = fs.readFileSync(filePath, 'utf8'),
         parsed = parseResearchFileContent(content);

   if (!isRecord(parsed.frontmatter)) {
      throw new Error(`Expected frontmatter object in ${filePath}`);
   }

   const researchPerformedAt = requireStringField(parsed.frontmatter, 'research_performed_at'),
         editorID = requireStringField(parsed.frontmatter, 'editor_id'),
         editorVersion = requireStringField(parsed.frontmatter, 'editor_version'),
         sourceURLs = listStringField(parsed.frontmatter, 'sources');

   if (!isSupportedEditorName(editorID)) {
      throw new Error(`Unknown editor_id "${editorID}" in ${filePath}`);
   }

   return {
      researchPerformedAt,
      editorID,
      editorVersion,
      sourceURLs,
      body: parsed.body,
      changes: parseChanges(parsed.body),
      absolutePath: filePath,
      relativePath: path.relative(rootDir, filePath),
   };
}

export function listEditorResearchEntries(rootDir: string = researchRoot): EditorResearchEntry[] {
   return listMarkdownFiles(rootDir)
      .map((filePath) => {
         return parseEditorResearchFile(filePath, rootDir);
      })
      .toSorted((left, right) => {
         const timeComparison = right.researchPerformedAt.localeCompare(left.researchPerformedAt);

         if (timeComparison !== 0) {
            return timeComparison;
         }

         const editorComparison = left.editorID.localeCompare(right.editorID);

         return editorComparison === 0 ? left.editorVersion.localeCompare(right.editorVersion) : editorComparison;
      });
}

export function getEditorResearchRoot(): string {
   return researchRoot;
}
