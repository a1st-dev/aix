import { Flags } from '@oclif/core';
import {
   getAcceptedEditorNames,
   isEditorInputName,
   normalizeEditorNames,
   type EditorName,
} from '@a1st/aix-core';

const VALID_EDITORS = getAcceptedEditorNames();

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

   return normalizeEditorNames(targets);
}

export function validateTargetEditors(
   targets: readonly string[] | undefined,
   error: (message: string) => never,
): void {
   if (!targets) {
      return;
   }

   for (const editor of targets) {
      if (!isEditorInputName(editor.toLowerCase())) {
         error(`Unknown editor: ${editor}. Valid options: ${VALID_EDITORS.join(', ')}`);
      }
   }
}
