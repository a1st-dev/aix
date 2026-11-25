import pMap from 'p-map';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'pathe';
import {
   createBackup,
   findNativeItemPath,
   getInstalledItem,
   getRuntimeAdapter,
   getSkillsDir,
   readState,
   safeRm,
   type EditorName,
   type NativeFileSection,
} from '@a1st/aix-core';
import type { ConfigScope } from '@a1st/aix-schema';
import type { Output } from './output.js';
import { isValidSkillName } from './skill-source.js';

/** Where a group of files lives: one editor's native config, or aix's own `.aix` directory. */
export type DeleteGroup = EditorName | 'aix';

export interface FilesToDelete {
   editor: DeleteGroup;
   files: string[];
}

export interface DeleteResult {
   editor: DeleteGroup;
   deleted: string[];
   alreadyMissing: string[];
   errors: string[];
}

export interface FindFilesToDeleteOptions {
   editors: readonly EditorName[];
   section: NativeFileSection;
   name: string;
   scope: ConfigScope;
   projectRoot: string;
}

/**
 * Editors link to one copy of each skill under `.aix/skills`. That copy can go only when no
 * editor outside this removal still has the skill installed.
 */
async function findUnusedSkillCopy(options: FindFilesToDeleteOptions): Promise<string | undefined> {
   const { editors, name, scope, projectRoot } = options;

   if (!isValidSkillName(name)) {
      return undefined;
   }

   const installRoot = scope === 'user' ? getRuntimeAdapter().os.homedir() : projectRoot,
         skillCopy = join(getSkillsDir(installRoot), name),
         removedEditors = new Set<string>(editors),
         installedEditors = getInstalledItem(await readState(scope, projectRoot), 'skills', name)?.editors ?? [],
         isStillLinked = installedEditors.some((editor) => {
            return !removedEditors.has(editor);
         });

   return existsSync(skillCopy) && !isStillLinked ? skillCopy : undefined;
}

/**
 * Find the native files that removing one item would delete. Paths come from each editor's
 * importer, so this reports what is on disk, never a path built from the item name.
 */
export async function findFilesToDelete(options: FindFilesToDeleteOptions): Promise<FilesToDelete[]> {
   const { editors, section, name, scope, projectRoot } = options,
         located = await pMap(
            editors,
            async (editor): Promise<FilesToDelete> => {
               const path = await findNativeItemPath({ editor, section, name, scope, projectRoot });

               return { editor, files: path ? [ path ] : [] };
            },
            { concurrency: 3 },
         ),
         results = located.filter(({ files }) => {
            return files.length > 0;
         }),
         skillCopy = section === 'skills' ? await findUnusedSkillCopy(options) : undefined;

   return skillCopy ? [ ...results, { editor: 'aix', files: [ skillCopy ] } ] : results;
}

/**
 * Delete a single file, handling missing files gracefully.
 */
async function deleteFile(
   file: string,
): Promise<{ file: string; status: 'deleted' | 'missing' | 'error'; error?: string }> {
   try {
      if (existsSync(file)) {
         // A link holds nothing of its own, and what it points at is not being deleted.
         if (!lstatSync(file).isSymbolicLink()) {
            await createBackup(file);
         }
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

export function printRemovalPreview(
   output: Pick<Output, 'log'>,
   filesToDelete: FilesToDelete[],
): void {
   const targets = filesToDelete.map(({ editor, files }) => ({
      editor,
      files: files.filter(existsSync),
   })).filter(({ files }) => files.length > 0);

   if (targets.length === 0) {
      return;
   }

   output.log('');
   output.log('Items to remove:');
   for (const { editor, files } of targets) {
      output.log(`  ${editor}`);
      for (const file of files) {
         output.log(`    - ${file}`);
      }
   }
   output.log('');
}

export function printEditorRemovalPreview(options: {
   output: Pick<Output, 'log'>;
   editors: readonly EditorName[];
   itemType: string;
   itemName: string;
   scope: 'project' | 'user';
}): void {
   const { output, editors, itemType, itemName, scope } = options;

   if (editors.length === 0) {
      return;
   }

   output.log('');
   output.log('Items to remove:');
   for (const editor of editors) {
      output.log(`  ${editor}: ${itemType} "${itemName}" (${scope})`);
   }
   output.log('');
}
