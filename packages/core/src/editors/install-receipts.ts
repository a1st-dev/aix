import { dirname, join, isAbsolute } from 'pathe';
import { parseTOML, stringifyTOML } from 'confbox';
import { parseJsonc, modifyJsonc, type ConfigScope } from '@a1st/aix-schema';
import { canonicalJson, hashBytes, hashCanonicalJson } from '../entity-hash.js';
import { getRuntimeAdapter } from '../runtime/index.js';
import { getStatePath } from '../state/tracker.js';
import { isRecord } from '../type-guards.js';
import type { ConfigSection } from '../merge.js';
import type { FileChange, FileChangeCategory } from './types.js';
import { extractManagedSection, upsertManagedSection } from './section-managed-markdown.js';
import { getNativeHookKeys, filterNativeHooks } from './native-hook-content.js';
import { getFileChangeAction } from './apply-file-changes.js';
import { normalizeEditorNames, type EditorName } from './types.js';

interface InstalledFile {
   path: string;
   section: ConfigSection;
   kind: 'json' | 'toml' | 'section' | 'file' | 'directory';
   content: string;
   renderedContent?: string;
   hookKeys?: Record<string, string[]>;
}

interface InstallReceipt {
   version: 1;
   source: string;
   editor: string;
   updatedAt: string;
   files: InstalledFile[];
}

interface PlanInstallReceiptOptions {
   source: string;
   editor: string;
   projectRoot: string;
   scope: ConfigScope;
   scopes: string[];
   changes: FileChange[];
}

const SECTIONS = new Set(['rules', 'mcp', 'skills', 'editors', 'prompts', 'agents', 'hooks', 'plugins', 'marketplaces']);

function isSection(value: unknown): value is ConfigSection {
   return typeof value === 'string' && SECTIONS.has(value);
}

function isInstalledFile(value: unknown): value is InstalledFile {
   return isRecord(value) && typeof value.path === 'string' && isAbsolute(value.path) && isSection(value.section) &&
      ['json', 'toml', 'section', 'file', 'directory'].includes(String(value.kind)) && typeof value.content === 'string' &&
      (value.renderedContent === undefined || typeof value.renderedContent === 'string') &&
      (value.hookKeys === undefined || (isRecord(value.hookKeys) && Object.values(value.hookKeys).every((keys) => {
         return Array.isArray(keys) && keys.every((key) => {
            return typeof key === 'string';
         });
      })));
}

function isReceipt(value: unknown): value is InstallReceipt {
   return isRecord(value) && value.version === 1 && typeof value.source === 'string' && typeof value.editor === 'string' &&
      typeof value.updatedAt === 'string' &&
      Array.isArray(value.files) && value.files.every(isInstalledFile);
}

function getSection(change: FileChange): ConfigSection | undefined {
   if (change.managedSection) {
      return change.managedSection;
   }
   switch (change.category) {
      case 'rule': return 'rules';
      case 'mcp': return 'mcp';
      case 'skill': return 'skills';
      case 'hook': return 'hooks';
      case 'plugin': return 'plugins';
      case 'marketplace': return 'marketplaces';
      default: return undefined;
   }
}

function getCategory(section: ConfigSection): FileChangeCategory {
   switch (section) {
      case 'rules': return 'rule';
      case 'mcp': return 'mcp';
      case 'skills': return 'skill';
      case 'hooks': return 'hook';
      case 'plugins': return 'plugin';
      case 'marketplaces': return 'marketplace';
      default: return 'workflow';
   }
}

async function readReceipts(directory: string): Promise<InstallReceipt[]> {
   const { fs } = getRuntimeAdapter();

   if (!fs.existsSync(directory)) {
      return [];
   }

   const paths = (await fs.readdir(directory)).filter((name) => {
      return name.endsWith('.json');
   });

   const receipts = await Promise.all(paths.map(async (name) => {
      const path = join(directory, name),
            value: unknown = JSON.parse(await fs.readFile(path, 'utf-8'));

      if (!isReceipt(value)) {
         throw new Error(`Invalid install receipt: ${path}`);
      }
      return value;
   }));

   return receipts.toSorted((a, b) => {
      return a.updatedAt.localeCompare(b.updatedAt);
   });
}

/** Editors with contributions still owned by this config at the requested scope. */
export async function listConfigInstallEditors(options: {
   source: string;
   scope: ConfigScope;
   projectRoot: string;
}): Promise<EditorName[]> {
   const directory = join(dirname(getStatePath(options.scope, options.projectRoot)), 'installs'),
         localReceipts = await readReceipts(directory),
         globalReceipts = options.scope === 'project' && getRuntimeAdapter().host.supportsGlobalHomeAccess()
            ? await readReceipts(join(dirname(getStatePath('user')), 'installs')) : [],
         receipts = [...localReceipts, ...globalReceipts.filter((receipt) => {
            return receipt.editor.endsWith(':global');
         })],
         editors = receipts.filter((receipt) => {
            return receipt.source === options.source && receipt.files.length > 0;
         }).map((receipt) => {
            return receipt.editor.replace(/:global$/, '');
         });

   return normalizeEditorNames(editors);
}

async function getDirectoryDigest(path: string): Promise<string> {
   const { fs } = getRuntimeAdapter(),
         stats = await fs.lstat(path);

   if (stats.isSymbolicLink()) {
      return hashBytes(`symlink:${await fs.readlink(path)}`);
   }
   if (!stats.isDirectory()) {
      return hashBytes(await fs.readFile(path));
   }

   const names = (await fs.readdir(path)).toSorted(),
         entries = await Promise.all(names.map(async (name) => {
            return [name, await getDirectoryDigest(join(path, name))];
         }));

   return hashCanonicalJson(entries);
}

async function snapshotChange(change: FileChange): Promise<InstalledFile | undefined> {
   const section = getSection(change),
         content = change.managedContent ?? change.content;

   if (!section || content === undefined || change.action === 'delete') {
      return undefined;
   }
   if (change.isDirectory) {
      if (!getRuntimeAdapter().fs.existsSync(change.path)) {
         return undefined;
      }
      return { path: change.path, section, kind: 'directory', content: await getDirectoryDigest(change.path) };
   }

   const managed = extractManagedSection(content);
   let kind: InstalledFile['kind'] = 'file';

   if (managed !== null) {
      kind = 'section';
   } else if (change.path.endsWith('.json')) {
      kind = 'json';
   } else if (change.path.endsWith('.toml')) {
      kind = 'toml';
   }

   const snapshot: InstalledFile = { path: change.path, section, kind, content: managed ?? content };

   if (section === 'hooks' && kind === 'json') {
      const parsed = parseStructured(snapshot, content),
            hooks = parsed.hooks;

      if (isRecord(hooks)) {
         snapshot.hookKeys = Object.fromEntries(await Promise.all(Object.entries(hooks).map(async ([event, entries]) => {
            const keys = Array.isArray(entries) ? (await Promise.all(entries.map(getNativeHookKeys))).flat() : [];

            return [event, keys];
         })));
      }
   }

   return snapshot;
}

function parseStructured(file: InstalledFile, content: string): Record<string, unknown> {
   const parsed: unknown = file.kind === 'toml' ? parseTOML(content) : parseJsonc(content).data;

   if (!isRecord(parsed) || (file.kind === 'json' && parseJsonc(content).errors.length > 0)) {
      throw new Error(`Cannot reconcile invalid editor config: ${file.path}`);
   }
   return parsed;
}

async function stripStructuredFile(file: InstalledFile, content: string, protectedFiles: InstalledFile[]): Promise<string> {
   const current = parseStructured(file, content),
         owned = parseStructured(file, file.content),
         protectedValues = protectedFiles.filter((entry) => {
            return entry.kind === file.kind;
         }).map((entry) => {
            return parseStructured(entry, entry.content);
         });
   let result = content;

   async function removeValue(
      path: [string] | [string, string],
      value: unknown,
      previous: unknown,
      protectedEntries: unknown[],
   ): Promise<void> {
      let replacement = value;

      if (Array.isArray(value) && Array.isArray(previous)) {
         const protectedArray = protectedEntries.flatMap((entry) => {
            return Array.isArray(entry) ? entry : [];
         });

         if (file.section === 'hooks') {
            const event = path.at(-1) ?? '',
                  oldKeys = new Set([
                     ...(file.hookKeys?.[event] ?? []), ...(await Promise.all(previous.map(getNativeHookKeys))).flat(),
                  ]),
                  protectedKeys = new Set([
                     ...protectedFiles.flatMap((entry) => {
                        return entry.hookKeys?.[event] ?? [];
                     }),
                     ...(await Promise.all(protectedArray.map(getNativeHookKeys))).flat(),
                  ]);

            replacement = await filterNativeHooks(value, (key) => {
               return !oldKeys.has(key) || protectedKeys.has(key);
            });
         } else {
            const oldKeys = new Set(previous.map(canonicalJson)),
                  protectedKeys = new Set(protectedArray.map(canonicalJson));

            replacement = value.filter((entry) => {
               const key = canonicalJson(entry);

               return !oldKeys.has(key) || protectedKeys.has(key);
            });
         }
      } else if (canonicalJson(value) === canonicalJson(previous) && !protectedEntries.some((entry) => {
         return canonicalJson(entry) === canonicalJson(previous);
      })) {
         replacement = protectedEntries.at(-1);
      }

      if (file.kind === 'json') {
         result = modifyJsonc(result, path, replacement);
      } else if (path.length === 1) {
         if (replacement === undefined) {
            delete current[path[0]];
         } else {
            current[path[0]] = replacement;
         }
      } else {
         const parent = current[path[0]];

         if (isRecord(parent)) {
            if (replacement === undefined) {
               delete parent[path[1]];
            } else {
               parent[path[1]] = replacement;
            }
         }
      }
   }

   await Promise.all(Object.entries(owned).map(async ([key, previous]) => {
      const value = current[key],
            protectedEntries = protectedValues.map((entry) => {
               return entry[key];
            });

      if (value === undefined) {
         return;
      }
      if (isRecord(value) && isRecord(previous)) {
         // Entries such as MCP servers are compared whole, so a user's edit is preserved.
         for (const [name, oldValue] of Object.entries(previous)) {
            if (value[name] !== undefined) {
               // eslint-disable-next-line no-await-in-loop -- JSONC mutations must remain sequential.
               await removeValue([key, name], value[name], oldValue, protectedEntries.map((entry) => {
                  return isRecord(entry) ? entry[name] : undefined;
               }).filter((entry) => {
                  return entry !== undefined;
               }));
            }
         }
      } else {
         await removeValue([key], value, previous, protectedEntries.filter((entry) => {
            return entry !== undefined;
         }));
      }
   }));

   return file.kind === 'toml' ? stringifyTOML(current) : result;
}

async function stripFile(file: InstalledFile, content: string, protectedFiles: InstalledFile[]): Promise<string | undefined> {
   if (file.kind === 'json' || file.kind === 'toml') {
      return stripStructuredFile(file, content, protectedFiles);
   }
   if (file.kind === 'section') {
      const managed = extractManagedSection(content),
            others = protectedFiles.filter((entry) => {
               return entry.kind === 'section';
            }).map((entry) => {
               return entry.content;
            });

      const knownSection = [file, ...protectedFiles].some((entry) => {
         return managed === (entry.renderedContent ?? entry.content);
      });

      if (knownSection) {
         return upsertManagedSection(content, [...new Set(others)].join('\n\n'));
      }
      return content;
   }
   if (content !== file.content || protectedFiles.some((entry) => {
      return entry.content === content;
   })) {
      return content;
   }
   return protectedFiles.at(-1)?.content;
}

/** Receipts contain only emitted contributions, never the editor's unrelated settings. */
export async function planInstallReceipt(
   options: PlanInstallReceiptOptions,
): Promise<{ changes: FileChange[]; receiptChange?: FileChange }> {
   const { source, editor, projectRoot, scope, scopes, changes } = options,
         directory = join(dirname(getStatePath(scope, projectRoot)), 'installs'),
         receiptPath = join(directory, hashCanonicalJson([source, editor]).slice('sha256:'.length) + '.json'),
         receipts = await readReceipts(directory),
         previous = receipts.find((receipt) => {
            return receipt.source === source && receipt.editor === editor;
         }),
         retained = receipts.filter((receipt) => {
            return receipt !== previous;
         }).flatMap((receipt) => {
            return receipt.files;
         }),
         snapshots = (await Promise.all(changes.map(snapshotChange))).filter((file) => {
            return file !== undefined;
         }),
         kept = previous?.files.filter((file) => {
            return !(scopes.includes(file.section) ||
               (scopes.includes('editors') && !['rules', 'mcp', 'skills'].includes(file.section)));
         }) ?? [],
         next: InstallReceipt = { version: 1, source, editor, updatedAt: new Date().toISOString(), files: [...kept, ...snapshots] },
         planned = new Map<string, FileChange>();

   for (const change of changes) {
      const existing = planned.get(change.path);

      planned.set(change.path, existing ? { ...change, category: existing.category, items: existing.items } : change);
   }

   for (const file of previous?.files ?? []) {
      if (kept.includes(file)) {
         continue;
      }

      const protectedFiles = [...retained, ...next.files].filter((entry) => {
               return entry.path === file.path;
            }),
            change = planned.get(file.path),
            { fs } = getRuntimeAdapter();

      if (change?.action === 'delete') {
         continue;
      }
      if (file.kind === 'directory') {
         try {
            // eslint-disable-next-line no-await-in-loop -- Verify installed bytes, including dangling symlinks.
            if (!change && protectedFiles.length === 0 && await getDirectoryDigest(file.path) === file.content) {
               planned.set(file.path, { path: file.path, action: 'delete', isDirectory: true, category: getCategory(file.section) });
            }
         } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
               throw error;
            }
         }
         continue;
      }
      if (!fs.existsSync(file.path)) {
         continue;
      }

      // eslint-disable-next-line no-await-in-loop -- A shared file may have several owned sections.
      const existing = await fs.readFile(file.path, 'utf-8'),
            content = change?.content ?? existing,
            // eslint-disable-next-line no-await-in-loop -- Reconcile each section against the previous result.
            cleaned = await stripFile(file, content, protectedFiles);

      if (cleaned !== content) {
         planned.set(file.path, {
            ...change,
            path: file.path,
            action: getFileChangeAction(existing, cleaned),
            content: cleaned,
            category: change?.category ?? getCategory(file.section),
         });
      }
   }

   // Shared managed Markdown sections need every source's contribution, even on updates.
   for (const file of snapshots.filter((entry) => {
      return entry.kind === 'section';
   })) {
      const change = planned.get(file.path),
            sections = [...retained.filter((entry) => {
               return entry.path === file.path && entry.kind === 'section';
            }).map((entry) => {
               return entry.content;
            }), file.content];

      if (change?.content !== undefined) {
         change.content = upsertManagedSection(change.content, [...new Set(sections)].join('\n\n'));
         file.renderedContent = extractManagedSection(change.content) ?? file.content;
      }
   }

   if (snapshots.length > 0 || previous) {
      planned.set(receiptPath, {
         path: receiptPath,
         action: previous ? 'update' : 'create',
         content: JSON.stringify(next, null, 2) + '\n',
         category: 'other',
      });
   }

   return {
      changes: [...planned.values()].filter((change) => {
         return change.path !== receiptPath;
      }),
      receiptChange: planned.get(receiptPath),
   };
}
