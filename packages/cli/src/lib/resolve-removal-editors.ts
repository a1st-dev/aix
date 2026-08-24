import {
   detectEditors,
   getInstalledItem,
   normalizeEditorNames,
   readState,
   type EditorName,
   type StateSection,
} from '@a1st/aix-core';
import { normalizeEditors, type AiJsonConfig, type ConfigScope } from '@a1st/aix-schema';

export interface ResolveRemovalEditorsOptions {
   /** Editors named by `--target`. When present, nothing else is consulted. */
   targetEditors?: EditorName[];
   /** State section the item belongs to. */
   section: StateSection;
   /** Item name as it appears in state: a server name, a rule name, a hook event. */
   itemName: string;
   /** The `editors` block from ai.json, when a config was loaded. */
   configuredEditors?: AiJsonConfig['editors'];
   scope: ConfigScope;
   projectRoot: string;
}

/**
 * Decide which editors a removal should clean up, preferring the record of where aix
 * actually installed the item.
 *
 * Detection alone is not enough. It answers "which editors exist on this machine", not
 * "which editors hold this item", so a removal that relies on it can leave the item
 * behind in an editor's config while dropping it from `ai.json`. State answers the second
 * question directly, because an install records the editors it wrote to.
 *
 * Callers must resolve editors before recording the removal, since `trackRemoval` erases
 * the state entry this reads.
 */
export async function resolveRemovalEditors(
   options: ResolveRemovalEditorsOptions,
): Promise<EditorName[]> {
   if (options.targetEditors) {
      return options.targetEditors;
   }

   const state = await readState(options.scope, options.projectRoot),
         installed = getInstalledItem(state, options.section, options.itemName);

   if (installed && installed.editors.length > 0) {
      return normalizeEditorNames(installed.editors);
   }

   if (options.configuredEditors) {
      return normalizeEditorNames(Object.keys(normalizeEditors(options.configuredEditors)));
   }

   return detectEditorsForRemoval(options.projectRoot);
}

/**
 * Editors installed on this machine, plus any the project itself is configured for. The
 * project half matters when aix wrote an editor's config in a checkout on a machine where
 * that editor is not installed; without it the removal would find nothing to clean.
 */
async function detectEditorsForRemoval(projectRoot: string): Promise<EditorName[]> {
   const [ global, project ] = await Promise.all([
      detectEditors(projectRoot),
      detectEditors(projectRoot, { projectOnly: true }),
   ]);

   return normalizeEditorNames([ ...global, ...project ]);
}
