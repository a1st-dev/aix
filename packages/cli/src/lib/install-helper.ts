import { dirname } from 'pathe';
import pMap from 'p-map';
import {
   installToEditor,
   detectEditors,
   loadConfig,
   trackInstall,
   updateInstalledState,
   type EditorName,
   type ApplyResult,
   type ConfigSection,
   type StateSection,
} from '@a1st/aix-core';
import {
   normalizeEditors,
   createEmptyConfig,
   isHookEvent,
   resolveScope,
   type ConfigScope,
   type AiJsonConfig,
   type HookMatcher,
} from '@a1st/aix-schema';

export interface InstallAfterAddOptions {
   configPath: string;
   sections: ConfigSection[];
   scope?: ConfigScope;
   quiet?: boolean;
   editors?: EditorName[];
}

export interface InstallAfterAddResult {
   installed: boolean;
   results: ApplyResult[];
   editors: EditorName[];
}

/** Format install results for display */
export function formatInstallResults(
   results: ApplyResult[],
): Array<{ editor: string; message: string; success: boolean }> {
   const output: Array<{ editor: string; message: string; success: boolean }> = [];

   for (const result of results) {
      if (result.success) {
         const actualChanges = result.changes.filter((c) => c.action !== 'unchanged');

         if (actualChanges.length > 0) {
            output.push({
               editor: result.editor,
               message: `Installed to ${result.editor}`,
               success: true,
            });
         }
      } else {
         output.push({
            editor: result.editor,
            message: `Failed to install to ${result.editor}: ${result.errors.join(', ')}`,
            success: false,
         });
      }
   }
   return output;
}

const TRACKABLE_SECTIONS = new Set<string>([
   'mcp',
   'skills',
   'rules',
   'prompts',
   'agents',
   'hooks',
]);

/**
 * Sections whose items aix records in its state file. Hooks are recorded under their
 * event name, which is what identifies them in ai.json.
 */
function isTrackableSection(section: ConfigSection): section is StateSection {
   return TRACKABLE_SECTIONS.has(section);
}

/**
 * Install to configured editors after an add operation. Explicit editors override ai.json editor
 * settings. Returns info about what was installed.
 */
export async function installAfterAdd(
   options: InstallAfterAddOptions,
): Promise<InstallAfterAddResult> {
   const loaded = await loadConfig(options.configPath);

   if (!loaded) {
      return { installed: false, results: [], editors: [] };
   }

   const configuredEditors = loaded.config.editors,
         normalizedEditors = configuredEditors ? normalizeEditors(configuredEditors) : {},
         editors = options.editors ?? (Object.keys(normalizedEditors) as EditorName[]);

   if (editors.length === 0) {
      return { installed: false, results: [], editors: [] };
   }

   const projectRoot = dirname(options.configPath),
         targetScope = options.scope ?? resolveScope(loaded.config),
         results = await pMap(
            editors,
            async (editor) => {
               try {
                  return await installToEditor(editor, loaded.config, projectRoot, {
                     scopes: options.sections,
                     configBaseDir: loaded.configBaseDir,
                     targetScope,
                  });
               } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);

                  return { editor, success: false, changes: [], errors: [message] };
               }
            },
            { concurrency: 2 },
         );

   await recordInstalledSections({
      config: loaded.config,
      sections: options.sections,
      scope: targetScope,
      editors: results.filter((r) => r.success).map((r) => r.editor),
      projectRoot,
   });

   return { installed: true, results, editors };
}

export interface RecordInstalledSectionsOptions {
   /** The config that was installed; its item names become the tracked set */
   config: AiJsonConfig;
   /** Sections the install covered. Sections aix does not track are ignored. */
   sections: ConfigSection[];
   scope: ConfigScope;
   /** Editors the install succeeded for */
   editors: EditorName[];
   projectRoot?: string;
}

/** The item names a config contributes to each tracked section. */
function getSectionNames(config: AiJsonConfig): Record<StateSection, string[]> {
   return {
      mcp: Object.keys(config.mcp ?? {}),
      skills: Object.keys(config.skills ?? {}),
      rules: Object.keys(config.rules ?? {}),
      prompts: Object.keys(config.prompts ?? {}),
      agents: Object.keys(config.agents ?? {}),
      hooks: Object.keys(config.hooks ?? {}),
   };
}

/** The installed item names, per section, that a recording call should write. */
function getSectionsToRecord(
   options: RecordInstalledSectionsOptions,
): Partial<Record<StateSection, string[]>> {
   const sectionNames = getSectionNames(options.config),
         result: Partial<Record<StateSection, string[]>> = {};

   for (const section of options.sections) {
      if (isTrackableSection(section)) {
         result[section] = sectionNames[section];
      }
   }

   return result;
}

/**
 * Record what a full install pass put in place, so `aix list` can tell aix-managed items
 * from ones that were already in the editor's config. Each installed section's tracked
 * set is replaced by the config's item names, so items dropped from ai.json stop being
 * reported as aix-managed. Callers must skip this on a dry run.
 */
export async function recordInstalledSections(
   options: RecordInstalledSectionsOptions,
): Promise<void> {
   if (options.editors.length === 0) {
      return;
   }

   await updateInstalledState({
      scope: options.scope,
      sections: getSectionsToRecord(options),
      editors: options.editors,
      projectRoot: options.projectRoot,
   });
}

/**
 * Record the items of a one-off install without disturbing the rest of the section, for
 * direct installs that bypass ai.json.
 */
export async function recordInstalledItems(
   options: RecordInstalledSectionsOptions,
): Promise<void> {
   if (options.editors.length === 0) {
      return;
   }

   await updateInstalledState({
      scope: options.scope,
      sections: getSectionsToRecord(options),
      editors: options.editors,
      projectRoot: options.projectRoot,
      mode: 'merge',
   });
}

export interface InstallItemOptions {
   /** Section type being installed */
   section: ConfigSection;
   /** Name of the item (e.g. MCP server name, rule name) */
   name: string;
   /** The item config value */
   value: unknown;
   /** Target scope for installation */
   scope: ConfigScope;
   /** Project root for project-scoped installs */
   projectRoot: string;
   /** Editors to install to. If not provided, detects installed editors. */
   editors?: EditorName[];
}

/**
 * Install a single item directly to editor configs.
 * Used by add/remove commands for immediate installation without requiring ai.json editors config.
 * For the `hooks` section, `name` is the hook event and `value` its array of matcher groups.
 */
export async function installSingleItem(
   options: InstallItemOptions,
): Promise<InstallAfterAddResult> {
   const { section, name, value, scope, projectRoot } = options;

   // Detect editors if not explicitly provided
   const editors = options.editors ?? (await detectEditors(projectRoot));

   if (editors.length === 0) {
      return { installed: false, results: [], editors: [] };
   }

   // Build a minimal config containing only the item to install
   const config: AiJsonConfig = createEmptyConfig();

   switch (section) {
      case 'mcp':
         config.mcp = { [name]: value as AiJsonConfig['mcp'][string] };
         break;
      case 'skills':
         config.skills = { [name]: value as AiJsonConfig['skills'][string] };
         break;
      case 'rules':
         config.rules = { [name]: value as AiJsonConfig['rules'][string] };
         break;
      case 'prompts':
         config.prompts = { [name]: value as AiJsonConfig['prompts'][string] };
         break;
      case 'hooks':
         if (!isHookEvent(name)) {
            return { installed: false, results: [], editors: [] };
         }
         config.hooks = { [name]: value as HookMatcher[] };
         break;
      default:
         return { installed: false, results: [], editors: [] };
   }

   const results = await pMap(
      editors,
      async (editor) => {
         try {
            return await installToEditor(editor, config, projectRoot, {
               scopes: [section],
               targetScope: scope,
            });
         } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            return { editor, success: false, changes: [], errors: [message] };
         }
      },
      { concurrency: 2 },
   );

   // Track the installation in state
   const installedEditors = results.filter((r) => r.success).map((r) => r.editor);

   if (installedEditors.length > 0 && isTrackableSection(section)) {
      await trackInstall(scope, section, name, installedEditors, projectRoot);
   }

   return { installed: true, results, editors };
}
