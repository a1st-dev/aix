import { dirname } from 'pathe';
import pMap from 'p-map';
import {
   installToEditor,
   detectEditors,
   loadConfig,
   trackInstall,
   syncSectionState,
   type EditorName,
   type ApplyResult,
   type ConfigSection,
   type StateSection,
} from '@a1st/aix-core';
import {
   normalizeEditors,
   createEmptyConfig,
   resolveScope,
   type ConfigScope,
   type AiJsonConfig,
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

const TRACKABLE_SECTIONS = new Set<StateSection>(['mcp', 'skills', 'rules', 'prompts', 'agents']);

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

   const installedEditors = results.filter((r) => r.success).map((r) => r.editor),
         trackableSections = options.sections.filter((s): s is StateSection =>
            TRACKABLE_SECTIONS.has(s as StateSection),
         );

   if (installedEditors.length > 0 && trackableSections.length > 0) {
      const sectionNames: Record<StateSection, string[]> = {
         mcp: Object.keys(loaded.config.mcp ?? {}),
         skills: Object.keys(loaded.config.skills ?? {}),
         rules: Object.keys(loaded.config.rules ?? {}),
         prompts: Object.keys(loaded.config.prompts ?? {}),
         agents: Object.keys(loaded.config.agents ?? {}),
      };

      await Promise.all(
         trackableSections.map((section) =>
            syncSectionState(targetScope, section, sectionNames[section], installedEditors, projectRoot),
         ),
      );
   }

   return { installed: true, results, editors };
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

   if (installedEditors.length > 0) {
      await trackInstall(scope, section, name, installedEditors, projectRoot);
   }

   return { installed: true, results, editors };
}
