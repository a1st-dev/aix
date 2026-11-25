import { parse, patch, stringify } from '@decimalturn/toml-patch';
import { isRecord } from './type-guards.js';

type TomlTable = Record<string, unknown>;

// Editors document their config with one section per table, down to a server's `env` table
// (`[mcp_servers.docs.env]`), so new tables are written that way and not inline.
const SECTION_FORMAT = { inlineTableStart: 3 };

/**
 * Parse a TOML document that will be changed and written back with {@link updateToml}. Both
 * use the same parser, so values that were not touched compare equal and are left alone.
 */
export function parseToml(content: string): TomlTable {
   const parsed: unknown = parse(content);

   if (!isRecord(parsed)) {
      throw new Error('TOML document root must be a table');
   }

   return parsed;
}

function escapeForRegExp(text: string): string {
   return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether the document writes this top-level table, or a table inside it, as a `[section]`. */
function usesSections(document: string, tableName: string): boolean {
   return new RegExp(`^\\s*\\[\\s*${escapeForRegExp(tableName)}\\s*[.\\]]`, 'm').test(document);
}

/** Render one new sub-table as a section of its own, without a header for its parent. */
function formatSection(tableName: string, name: string, table: TomlTable): string {
   const parentHeader = stringify({ [tableName]: {} }, SECTION_FORMAT).trim(),
         section = stringify({ [tableName]: { [name]: table } }, SECTION_FORMAT).trim();

   return section.startsWith(parentHeader) ? section.slice(parentHeader.length).trim() : section;
}

/**
 * Split off the sub-tables that `value` adds, such as a new `mcp_servers.<name>`. The patcher
 * writes a new sub-table as a dotted inline key above the document's first section, which is
 * valid TOML but not how anyone writes these files, so they are appended as sections instead.
 */
function takeNewSections(existing: string, current: TomlTable, value: TomlTable): { remaining: TomlTable; sections: string[] } {
   const remaining: TomlTable = {},
         sections: string[] = [];

   for (const [ tableName, table ] of Object.entries(value)) {
      const currentTable = current[tableName],
            // A table written inline cannot be extended by a section later in the document.
            canAppend = isRecord(table) && (currentTable === undefined || (isRecord(currentTable) && usesSections(existing, tableName)));

      if (!isRecord(table) || !canAppend) {
         remaining[tableName] = table;
         continue;
      }

      const kept: TomlTable = {};

      for (const [ name, entry ] of Object.entries(table)) {
         if (isRecord(entry) && !(isRecord(currentTable) && name in currentTable)) {
            sections.push(formatSection(tableName, name, entry));
         } else {
            kept[name] = entry;
         }
      }
      if (currentTable !== undefined || Object.keys(kept).length > 0) {
         remaining[tableName] = kept;
      }
   }

   return { remaining, sections };
}

/**
 * Write changed values into an existing TOML document, keeping its comments, key order, and
 * formatting. Serializing the whole value instead would rewrite a hand-maintained file such as
 * `~/.codex/config.toml` and discard every comment in it.
 */
export function updateToml(existing: string | null, value: TomlTable): string {
   if (!existing?.trim()) {
      return stringify(value, SECTION_FORMAT);
   }

   const { remaining, sections } = takeNewSections(existing, parseToml(existing), value),
         patched = patch(existing, remaining, SECTION_FORMAT);

   return sections.length === 0 ? patched : `${patched.trimEnd()}\n\n${sections.join('\n\n')}\n`;
}
