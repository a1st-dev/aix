import { createEmptyConfig, parseConfig, type AiJsonConfig, type ConfigScope } from '@a1st/aix-schema';
import { detectEditors, installToEditor } from './editors/install.js';
import { normalizeEditorNames, type ApplyResult, type EditorName } from './editors/types.js';
import { getRuntimeAdapter } from './runtime/index.js';
import { getInstalledItem, readState, trackInstall, trackRemoval } from './state/tracker.js';
import type { StateSection } from './state/types.js';

export interface InstallItemOptions {
   /** The `ai.json` section the item belongs to. */
   readonly section: StateSection;
   /** The key the item has in its section. For `hooks`, the hook event. */
   readonly name: string;
   /** What `ai.json` would have under that key, such as `{ path: '/abs/skill-dir' }` for a skill. */
   readonly value: unknown;
   /** `user` writes editor config under the home directory, `project` under `projectRoot`. */
   readonly scope: ConfigScope;
   /** Defaults to the current working directory. */
   readonly projectRoot?: string;
   /** Editor names or aliases. Defaults to the editors detected on this machine. */
   readonly editors?: readonly string[];
   /** Report the file changes without writing anything. */
   readonly dryRun?: boolean;
}

export type RemoveItemOptions = Omit<InstallItemOptions, 'value'>;

export interface ItemInstallResult {
   /** The editors that were processed. Empty when none was named, detected, or recorded. */
   readonly editors: EditorName[];
   /** One result per editor, in the same order as `editors`. */
   readonly results: ApplyResult[];
}

interface ApplyItemOptions extends RemoveItemOptions {
   readonly config: AiJsonConfig;
   readonly editors: readonly EditorName[];
}

function createItemConfig(section: StateSection, entries: Record<string, unknown>): AiJsonConfig {
   return parseConfig({ ...createEmptyConfig(), [section]: entries });
}

/**
 * Each item is its own install source. aix compares an install with the previous install from
 * the same source and deletes what is no longer in it, so a shared source would make a
 * one-item config delete every other item.
 */
function getItemSource(section: StateSection, name: string): string {
   return `direct:${section}:${name}`;
}

async function applyItemConfig(options: ApplyItemOptions): Promise<ItemInstallResult> {
   const { section, name, scope, config, dryRun } = options,
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         results: ApplyResult[] = [];

   // One editor at a time: editors share files such as .mcp.json and the .aix skill copies.
   for (const editor of options.editors) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential on purpose, see above.
         results.push(await installToEditor(editor, config, projectRoot, {
            dryRun,
            scopes: [ section ],
            targetScope: scope,
            // A project-scope install must leave the home directory alone.
            strictTargetScope: scope === 'project',
            configSource: getItemSource(section, name),
         }));
      } catch (error) {
         results.push({ editor, success: false, changes: [], errors: [ error instanceof Error ? error.message : String(error) ] });
      }
   }

   return { editors: [ ...options.editors ], results };
}

function listSucceededEditors(results: readonly ApplyResult[]): EditorName[] {
   return results
      .filter((result) => {
         return result.success;
      })
      .map((result) => {
         return result.editor;
      });
}

/**
 * Install one item (a skill, an MCP server, a rule, ...) into editors without an `ai.json`.
 * The install is recorded, so `removeItem` and `aix list` know about it.
 */
export async function installItem(options: InstallItemOptions): Promise<ItemInstallResult> {
   const { section, name, value, scope, dryRun } = options,
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         config = createItemConfig(section, { [name]: value }),
         editors = options.editors ? normalizeEditorNames(options.editors) : await detectEditors(projectRoot),
         installed = await applyItemConfig({ section, name, scope, projectRoot, dryRun, config, editors }),
         succeededEditors = listSucceededEditors(installed.results);

   if (!dryRun && succeededEditors.length > 0) {
      await trackInstall({ scope, section, name, editors: succeededEditors, projectRoot });
   }

   return installed;
}

/**
 * Remove an item that `installItem` (or `aix add` without `--save`) installed. Only what that
 * install created is deleted: an item of the same name that the user wrote, or that another
 * `ai.json` installed, stays.
 */
export async function removeItem(options: RemoveItemOptions): Promise<ItemInstallResult> {
   const { section, name, scope, dryRun } = options,
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         recordedEditors = getInstalledItem(await readState(scope, projectRoot), section, name)?.editors ?? [],
         editors = normalizeEditorNames(options.editors ?? recordedEditors),
         // Installing an empty section from the item's source deletes what that source created.
         removed = await applyItemConfig({ section, name, scope, projectRoot, dryRun, config: createItemConfig(section, {}), editors }),
         succeededEditors = listSucceededEditors(removed.results);

   if (!dryRun && succeededEditors.length > 0) {
      await trackRemoval({ scope, section, name, projectRoot, editors: succeededEditors });
   }

   return removed;
}
