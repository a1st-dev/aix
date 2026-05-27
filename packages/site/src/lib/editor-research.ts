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
   const frontmatterMatch = /^---\n(?<frontmatter>[\s\S]*?)\n---\n?(?<body>[\s\S]*)$/u.exec(content);

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

function classifyStatus(aixStatus: string): EditorResearchStatus {
   const normalized = aixStatus.toLowerCase();

   if (normalized.includes('needs follow-up')) {
      return 'follow-up';
   }
   if (
      normalized.includes('already aligned') ||
      normalized.includes('already exposes') ||
      normalized.includes('already partly aligned')
   ) {
      return 'supported';
   }
   if (
      normalized.includes('no code change') ||
      normalized.includes('no current code change') ||
      normalized.includes('no schema change') ||
      normalized.includes('no format change') ||
      normalized.includes('no config-format change') ||
      normalized.includes('no implementation change')
   ) {
      return 'no-change';
   }

   return 'unknown';
}

function parseChanges(body: string): EditorResearchChange[] {
   const lines = getChangesSection(body).split('\n'),
         changes: EditorResearchChange[] = [];
   let current: EditorResearchChange | undefined;

   for (const line of lines) {
      if (line.startsWith('- ')) {
         if (current) {
            changes.push(current);
         }

         current = {
            summary: line.slice(2).trim(),
            aixStatus: 'No aix status recorded.',
            status: 'unknown',
         };
         continue;
      }

      const trimmed = line.trim(),
            aixStatusPrefix = '- aix status:';

      if (current && trimmed.toLowerCase().startsWith(aixStatusPrefix)) {
         const aixStatus = trimmed.slice(aixStatusPrefix.length).trim();

         current.aixStatus = aixStatus;
         current.status = classifyStatus(aixStatus);
      }
   }

   if (current) {
      changes.push(current);
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
