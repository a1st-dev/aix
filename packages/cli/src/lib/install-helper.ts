import { dirname } from 'pathe';
import pMap from 'p-map';
import {
   installToEditor,
   loadConfig,
   type EditorName,
   type ApplyResult,
   type ConfigScope,
} from '@a1st/aix-core';
import { normalizeEditors } from '@a1st/aix-schema';

export interface InstallAfterAddOptions {
   configPath: string;
   scopes: ConfigScope[];
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
export async function installAfterAdd(options: InstallAfterAddOptions): Promise<InstallAfterAddResult> {
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
         results = await pMap(
            editors,
            (editor) => installToEditor(editor, loaded.config, projectRoot, {
               scopes: options.scopes,
               configBaseDir: loaded.configBaseDir,
            }),
            { concurrency: 2 },
         );

   return { installed: true, results, editors };
}
