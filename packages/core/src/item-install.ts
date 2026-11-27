import { createEmptyConfig, parseConfig, type AiJsonConfig, type AiJsonConfigInput, type ConfigScope, type HookEvent } from '@a1st/aix-schema';
import { detectEditors, installToEditor } from './editors/install.js';
import { normalizeEditorNames, type ApplyResult, type EditorName } from './editors/types.js';
import { getRuntimeAdapter } from './runtime/index.js';
import { getInstalledItem, readState, trackInstall, trackRemoval } from './state/tracker.js';
import type { StateSection } from './state/types.js';

const itemSections = {
   skill: 'skills',
   mcp: 'mcp',
   rule: 'rules',
   prompt: 'prompts',
   agent: 'agents',
   hook: 'hooks',
   plugin: 'plugins',
   marketplace: 'marketplaces',
} as const satisfies Record<string, StateSection>;

export type InstallableItemType = keyof typeof itemSections;

type ItemEntries<Type extends InstallableItemType> = NonNullable<AiJsonConfigInput[(typeof itemSections)[Type]]>;
type ItemConfig<Type extends InstallableItemType> = ItemEntries<Type>[keyof ItemEntries<Type>];

export interface ItemTargetOptions {
   /** `user` writes editor config under the home directory, `project` under `projectRoot`. */
   readonly scope: ConfigScope;
   /** Defaults to the current working directory. */
   readonly projectRoot?: string;
   /** Editor names or aliases. An empty list selects no editors. */
   readonly editors?: readonly string[];
   /** Report the file changes without writing anything. */
   readonly dryRun?: boolean;
}

interface NamedItemOptions extends ItemTargetOptions {
   readonly name: string;
}

export type RemoveItemOptions = {
   [Type in InstallableItemType]: ItemTargetOptions & {
      readonly type: Type;
      /** The installed name, or the lifecycle event for a hook. */
      readonly name: Type extends 'hook' ? HookEvent : string;
   };
}[InstallableItemType];

export type InstallItemOptions = {
   [Type in InstallableItemType]: Extract<RemoveItemOptions, { type: Type }> & {
      readonly config: ItemConfig<Type>;
   };
}[InstallableItemType];

interface LegacyRemoveItemOptions extends NamedItemOptions {
   readonly section: StateSection;
}

interface LegacyInstallItemOptions extends LegacyRemoveItemOptions {
   readonly value: unknown;
}

export interface InstallSkillOptions extends NamedItemOptions {
   readonly source: Extract<ItemConfig<'skill'>, { source: unknown }>['source'];
}

export interface InstallMcpServerOptions extends NamedItemOptions {
   readonly server: ItemConfig<'mcp'>;
}

export interface InstallRuleOptions extends NamedItemOptions {
   readonly rule: ItemConfig<'rule'>;
}

export interface InstallPromptOptions extends NamedItemOptions {
   readonly prompt: ItemConfig<'prompt'>;
}

export interface InstallAgentOptions extends NamedItemOptions {
   readonly agent: ItemConfig<'agent'>;
}

interface HookOptions extends ItemTargetOptions {
   readonly event: HookEvent;
}

export interface InstallHookOptions extends HookOptions {
   readonly matchers: ItemConfig<'hook'>;
}

export interface InstallPluginOptions extends NamedItemOptions {
   readonly plugin: ItemConfig<'plugin'>;
}

export interface InstallMarketplaceOptions extends NamedItemOptions {
   readonly marketplace: ItemConfig<'marketplace'>;
}

export interface ItemInstallResult {
   /** The editors that were processed. Empty when none was named, detected, or recorded. */
   readonly editors: EditorName[];
   /** One result per editor, in the same order as `editors`. */
   readonly results: ApplyResult[];
}

interface ApplyItemOptions extends LegacyRemoveItemOptions {
   readonly config: AiJsonConfig;
   readonly editors: readonly EditorName[];
}

function getItemSection(options: RemoveItemOptions | LegacyRemoveItemOptions): StateSection {
   if ('section' in options) {
      return options.section;
   }

   if (!Object.hasOwn(itemSections, options.type)) {
      throw new Error(`Unknown installable item type: ${options.type}`);
   }

   return itemSections[options.type];
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

export function installItem(options: LegacyInstallItemOptions): Promise<ItemInstallResult>;
/** Install one item directly into editors. By default, installs into the detected editors. */
export function installItem(options: InstallItemOptions): Promise<ItemInstallResult>;
export async function installItem(options: InstallItemOptions | LegacyInstallItemOptions): Promise<ItemInstallResult> {
   const { name, scope, dryRun } = options,
         section = getItemSection(options),
         value = 'type' in options ? options.config : options.value,
         projectRoot = options.projectRoot ?? getRuntimeAdapter().process.cwd(),
         config = createItemConfig(section, { [name]: value }),
         editors = options.editors
            ? normalizeEditorNames(options.editors)
            : (await detectEditors()).map(({ id }) => {
               return id;
            }),
         installed = await applyItemConfig({ section, name, scope, projectRoot, dryRun, config, editors }),
         succeededEditors = listSucceededEditors(installed.results);

   if (!dryRun && succeededEditors.length > 0) {
      await trackInstall({ scope, section, name, editors: succeededEditors, projectRoot });
   }

   return installed;
}

export function removeItem(options: LegacyRemoveItemOptions): Promise<ItemInstallResult>;
/** Remove the files and config entries managed by a direct install. Defaults to the recorded editors. */
export function removeItem(options: RemoveItemOptions): Promise<ItemInstallResult>;
export async function removeItem(options: RemoveItemOptions | LegacyRemoveItemOptions): Promise<ItemInstallResult> {
   const { name, scope, dryRun } = options,
         section = getItemSection(options),
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

export function installSkill({ source, ...target }: InstallSkillOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'skill', config: source });
}

export function removeSkill(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'skill' });
}

export function installMcpServer({ server, ...target }: InstallMcpServerOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'mcp', config: server });
}

export function removeMcpServer(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'mcp' });
}

export function installRule({ rule, ...target }: InstallRuleOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'rule', config: rule });
}

export function removeRule(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'rule' });
}

export function installPrompt({ prompt, ...target }: InstallPromptOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'prompt', config: prompt });
}

export function removePrompt(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'prompt' });
}

export function installAgent({ agent, ...target }: InstallAgentOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'agent', config: agent });
}

export function removeAgent(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'agent' });
}

export function installHook({ event, matchers, ...target }: InstallHookOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'hook', name: event, config: matchers });
}

export function removeHook({ event, ...target }: HookOptions): Promise<ItemInstallResult> {
   return removeItem({ ...target, type: 'hook', name: event });
}

export function installPlugin({ plugin, ...target }: InstallPluginOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'plugin', config: plugin });
}

export function removePlugin(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'plugin' });
}

export function installMarketplace({ marketplace, ...target }: InstallMarketplaceOptions): Promise<ItemInstallResult> {
   return installItem({ ...target, type: 'marketplace', config: marketplace });
}

export function removeMarketplace(options: NamedItemOptions): Promise<ItemInstallResult> {
   return removeItem({ ...options, type: 'marketplace' });
}
