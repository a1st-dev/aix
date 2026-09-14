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
   section: StateSection | 'marketplaces' | 'plugins';
   /** Item name as it appears in state: a server name, a rule name, a hook event. */
   itemName: string;
   /** The `editors` block from ai.json, when a config was loaded. */
   configuredEditors?: AiJsonConfig['editors'];
   scope: ConfigScope;
   projectRoot: string;
}

/**
 * Decide which editors a removal should inspect. Without `--target`, include every
 * detected editor as well as editors recorded by aix or named in ai.json. Removal
 * strategies leave unrelated config alone, so using the union removes every matching
 * item without guessing which source created it.
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

   const [state, detectedEditors] = await Promise.all([
            readState(options.scope, options.projectRoot),
            detectEditorsForRemoval(options.projectRoot),
         ]),
         installed = options.section in state.installed
            ? getInstalledItem(state, options.section as StateSection, options.itemName)
            : undefined,
         configuredEditors = options.configuredEditors
            ? Object.keys(normalizeEditors(options.configuredEditors))
            : [];

   return normalizeEditorNames([
      ...(installed?.editors ?? []),
      ...configuredEditors,
      ...detectedEditors,
   ]);
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
