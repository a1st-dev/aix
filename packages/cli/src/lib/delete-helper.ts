import pMap from 'p-map';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';
import { safeRm, type EditorName } from '@a1st/aix-core';

export type RemovableItemType = 'skill' | 'mcp' | 'agent' | 'rule' | 'prompt';

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
            antigravity: { project: '.agents/skills', user: '.gemini/config/skills' },
            opencode: { project: '.opencode/skills', user: '.config/opencode/skills' },
            grok: { project: '.grok/skills', user: '.grok/skills' },
         };

         const skillDirConfig = editorSkillDirs[editor];

         if (skillDirConfig) {
            files.push(join(installRoot, targetScope === 'user' ? skillDirConfig.user : skillDirConfig.project, itemName));
         }
      } else if (itemType === 'agent') {
         if (editor === 'copilot') {
            const projectDir = join(installRoot, '.github', 'agents'),
                  userDir = join(installRoot, '.config', 'github-copilot', 'agents'),
                  altUserDir = join(installRoot, '.copilot', 'agents'),
                  targetDir = targetScope === 'user' ? userDir : projectDir;

            files.push(join(targetDir, `${itemName}.agent.md`));
            files.push(join(targetDir, `${itemName}.md`));
            if (targetScope === 'user') {
               files.push(join(altUserDir, `${itemName}.agent.md`));
               files.push(join(altUserDir, `${itemName}.md`));
            }
         } else {
            const editorAgentDirs: Partial<Record<EditorName, { project: string; user: string }>> = {
               'claude-code': { project: '.claude/agents', user: '.claude/agents' },
               cursor: { project: '.cursor/agents', user: '.cursor/agents' },
               antigravity: { project: '.agents/agents', user: '.gemini/config/agents' },
               opencode: { project: '.opencode/agents', user: '.config/opencode/agents' },
            };

            const agentDirConfig = editorAgentDirs[editor];

            if (agentDirConfig) {
               const dir = targetScope === 'user' ? agentDirConfig.user : agentDirConfig.project;

               files.push(join(installRoot, dir, `${itemName}.md`));
            }
         }
      } else if (itemType === 'rule') {
         const editorRuleDirs: Partial<Record<EditorName, { project: string; user: string; ext: string }>> = {
            'claude-code': { project: '.claude/rules', user: '.claude/rules', ext: '.md' },
            cursor: { project: '.cursor/rules', user: '.cursor/rules', ext: '.mdc' },
            windsurf: { project: '.windsurf/rules', user: '.windsurf/rules', ext: '.md' },
            copilot: { project: '.github/instructions', user: '.config/github-copilot/instructions', ext: '.md' },
            zed: { project: '.zed/rules', user: '.zed/rules', ext: '.md' },
            codex: { project: '.codex/rules', user: '.codex/rules', ext: '.md' },
            antigravity: { project: '.gemini/rules', user: '.gemini/rules', ext: '.md' },
            opencode: { project: '.opencode/rules', user: '.config/opencode/rules', ext: '.md' },
            grok: { project: '.grok/rules', user: '.grok/rules', ext: '.md' },
         };

         const ruleDirConfig = editorRuleDirs[editor];

         if (ruleDirConfig) {
            const dir = targetScope === 'user' ? ruleDirConfig.user : ruleDirConfig.project;

            files.push(join(installRoot, dir, `${itemName}${ruleDirConfig.ext}`));
         }
      } else if (itemType === 'prompt') {
         const editorPromptDirs: Partial<Record<EditorName, { project: string; user: string; ext: string }>> = {
            'claude-code': { project: '.claude/commands', user: '.claude/commands', ext: '.md' },
            cursor: { project: '.cursor/commands', user: '.cursor/commands', ext: '.md' },
            windsurf: { project: '.windsurf/workflows', user: '.windsurf/workflows', ext: '.md' },
            copilot: { project: '.github/prompts', user: '.config/github-copilot/prompts', ext: '.prompt.md' },
            zed: { project: '.zed/prompts', user: '.zed/prompts', ext: '.md' },
            codex: { project: '.codex/prompts', user: '.codex/prompts', ext: '.md' },
            antigravity: { project: '.gemini/commands', user: '.gemini/commands', ext: '.md' },
            opencode: { project: '.opencode/commands', user: '.config/opencode/commands', ext: '.md' },
            grok: { project: '.grok/commands', user: '.grok/commands', ext: '.md' },
         };

         const promptDirConfig = editorPromptDirs[editor];

         if (promptDirConfig) {
            const dir = targetScope === 'user' ? promptDirConfig.user : promptDirConfig.project;

            files.push(join(installRoot, dir, `${itemName}${promptDirConfig.ext}`));
         }
      }

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
