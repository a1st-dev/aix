import pMap from 'p-map';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { getAdapter, safeRm, type EditorName } from '@a1st/aix-core';

export type RemovableItemType = 'skill' | 'mcp';

export interface FilesToDelete {
   editor: EditorName;
   files: string[];
}

export interface DeleteResult {
   editor: EditorName;
   deleted: string[];
   alreadyMissing: string[];
   errors: string[];
}

/**
 * Compute files that would be deleted for a given item removal.
 */
export function computeFilesToDelete(
   editors: EditorName[],
   itemType: RemovableItemType,
   itemName: string,
   projectRoot: string,
): FilesToDelete[] {
   const results: FilesToDelete[] = [];

   for (const editor of editors) {
      const adapter = getAdapter(editor),
            configDir = join(projectRoot, adapter.configDir),
            files: string[] = [];

      if (itemType === 'skill') {
         // Skills are installed to .aix/skills/{name}/ (shared across editors)
         // Plus any pointer rules in the editor's rules directory
         const skillDir = join(projectRoot, '.aix', 'skills', itemName);

         files.push(skillDir);

         // Pointer rule file (if editor uses pointer strategy)
         // Format: {configDir}/rules/skill-{name}.md
         const pointerRule = join(configDir, 'rules', `skill-${itemName}.md`);

         files.push(pointerRule);
      }
      // Note: MCP removal doesn't delete individual files - it re-installs to regenerate config

      if (files.length > 0) {
         results.push({ editor, files });
      }
   }

   return results;
}

/**
 * Delete a single file, handling missing files gracefully.
 */
async function deleteFile(
   file: string,
): Promise<{ file: string; status: 'deleted' | 'missing' | 'error'; error?: string }> {
   try {
      if (existsSync(file)) {
         await safeRm(file, { force: true });
         return { file, status: 'deleted' };
      }
      return { file, status: 'missing' };
   } catch (error) {
      return {
         file,
         status: 'error',
         error: error instanceof Error ? error.message : String(error),
      };
   }
}

/**
 * Delete files, handling missing files gracefully.
 */
export async function deleteFiles(filesToDelete: FilesToDelete[]): Promise<DeleteResult[]> {
   return pMap(
      filesToDelete,
      async ({ editor, files }) => {
         const outcomes = await pMap(files, deleteFile, { concurrency: 5 });

         return {
            editor,
            deleted: outcomes.filter((o) => o.status === 'deleted').map((o) => o.file),
            alreadyMissing: outcomes.filter((o) => o.status === 'missing').map((o) => o.file),
            errors: outcomes.filter((o) => o.status === 'error').map((o) => `${o.file}: ${o.error}`),
         };
      },
      { concurrency: 3 },
   );
}

/**
 * Get all files that exist from the computed list.
 */
export function getExistingFiles(filesToDelete: FilesToDelete[]): string[] {
   const existing: string[] = [];

   for (const { files } of filesToDelete) {
      for (const file of files) {
         if (existsSync(file)) {
            existing.push(file);
         }
      }
   }
   return existing;
}
