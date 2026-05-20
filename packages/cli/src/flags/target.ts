import { Flags } from '@oclif/core';
import { getAvailableEditors, type EditorName } from '@a1st/aix-core';

const VALID_EDITORS = getAvailableEditors();

export const targetFlag = {
   target: Flags.string({
      char: 't',
      description: 'Target specific editor (repeatable, case-insensitive)',
      multiple: true,
      options: VALID_EDITORS,
   }),
};

export function resolveTargetEditors(targets: string[] | undefined): EditorName[] | undefined {
   if (!targets || targets.length === 0) {
      return undefined;
   }

   return targets.map((editor) => editor.toLowerCase() as EditorName);
}

export function validateTargetEditors(
   targets: readonly EditorName[] | undefined,
   error: (message: string) => never,
): void {
   if (!targets) {
      return;
   }

   for (const editor of targets) {
      if (!VALID_EDITORS.includes(editor)) {
         error(`Unknown editor: ${editor}. Valid options: ${VALID_EDITORS.join(', ')}`);
      }
   }
}
