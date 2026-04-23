import pMap from 'p-map';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';
import { safeRm, type EditorName } from '@a1st/aix-core';

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

export interface DeleteTargetOptions {
   projectRoot: string;
   targetScope?: 'project' | 'user';
}

/**
 * Compute files that would be deleted for a given item removal.
 */
export function computeFilesToDelete(
   editors: EditorName[],
   itemType: RemovableItemType,
   itemName: string,
   options: DeleteTargetOptions,
): FilesToDelete[] {
   const results: FilesToDelete[] = [],
         targetScope = options.targetScope ?? 'project',
         installRoot = targetScope === 'user' ? homedir() : options.projectRoot;

   for (const editor of editors) {
      const files: string[] = [];

      if (itemType === 'skill') {
         const skillDir = join(installRoot, '.aix', 'skills', itemName);

         files.push(skillDir);

         const editorSkillDirs: Record<EditorName, { project: string; user: string }> = {
            windsurf: { project: '.windsurf/skills', user: '.windsurf/skills' },
            cursor: { project: '.cursor/skills', user: '.cursor/skills' },
            'claude-code': { project: '.claude/skills', user: '.claude/skills' },
            copilot: { project: '.github/skills', user: '.github/skills' },
            zed: { project: '.zed/skills', user: '.zed/skills' },
            codex: { project: '.agents/skills', user: '.codex/skills' },
            gemini: { project: '.gemini/skills', user: '.gemini/skills' },
            opencode: { project: '.opencode/skills', user: '.config/opencode/skills' },
         };

         const skillDirConfig = editorSkillDirs[editor];

         if (skillDirConfig) {
            files.push(join(installRoot, targetScope === 'user' ? skillDirConfig.user : skillDirConfig.project, itemName));
         }
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
