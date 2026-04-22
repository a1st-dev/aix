import { dirname } from 'pathe';
import pMap from 'p-map';
import {
   installToEditor,
   detectEditors,
   loadConfig,
   trackInstall,
   type EditorName,
   type ApplyResult,
   type ConfigSection,
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

/**
 * Install to configured editors after an add operation. Only installs if editors are configured in
 * ai.json. Returns info about what was installed.
 */
export async function installAfterAdd(
   options: InstallAfterAddOptions,
): Promise<InstallAfterAddResult> {
   const loaded = await loadConfig(options.configPath);

   if (!loaded) {
      return { installed: false, results: [], editors: [] };
   }

   const configuredEditors = loaded.config.editors;

   if (!configuredEditors) {
      return { installed: false, results: [], editors: [] };
   }

   const normalizedEditors = normalizeEditors(configuredEditors),
         editors = Object.keys(normalizedEditors) as EditorName[];

   if (editors.length === 0) {
      return { installed: false, results: [], editors: [] };
   }

   const projectRoot = dirname(options.configPath),
         targetScope = options.scope ?? resolveScope(loaded.config),
         results = await pMap(
            editors,
            (editor) =>
               installToEditor(editor, loaded.config, projectRoot, {
                  scopes: options.sections,
                  configBaseDir: loaded.configBaseDir,
                  targetScope,
               }),
            { concurrency: 2 },
         );

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
   const config = createEmptyConfig() as AiJsonConfig & Record<string, unknown>;

   switch (section) {
   case 'mcp':
      (config as any).mcp = { [name]: value };
      break;
   case 'skills':
      (config as any).skills = { [name]: value };
      break;
   case 'rules':
      (config as any).rules = { [name]: value };
      break;
   case 'prompts':
      (config as any).prompts = { [name]: value };
      break;
   default:
      return { installed: false, results: [], editors: [] };
   }

   const results = await pMap(
      editors,
      (editor) =>
         installToEditor(editor, config, projectRoot, { scopes: [section], targetScope: scope }),
      { concurrency: 2 },
   );

   // Track the installation in state
   const installedEditors = results.filter((r) => r.success).map((r) => r.editor);

   if (installedEditors.length > 0) {
      await trackInstall(scope, section, name, installedEditors, projectRoot);
   }

   return { installed: true, results, editors };
}
