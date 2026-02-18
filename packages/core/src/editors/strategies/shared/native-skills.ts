import pMap from 'p-map';
import { mkdir, cp, symlink, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy, NativeSkillsConfig } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';
import { safeRm } from '../../../fs/safe-rm.js';

/**
 * Native skills strategy for editors that support Agent Skills natively (Claude Code, GitHub Copilot,
 * Cursor). Copies skills to `.aix/skills/` as the source of truth and creates symlinks from the
 * editor's skills directory.
 */
export class NativeSkillsStrategy implements SkillsStrategy {
   private editorSkillsDir: string;

   constructor(config: NativeSkillsConfig) {
      this.editorSkillsDir = config.editorSkillsDir;
   }

   getSkillsDir(): string {
      return '.aix/skills';
   }

   isNative(): boolean {
      return true;
   }

   async installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean } = {},
   ): Promise<FileChange[]> {
      const entries = Array.from(skills.entries());

      const nestedChanges = await pMap(
         entries,
         async ([name, skill]) => {
            const changes: FileChange[] = [];

            // 1. Copy to .aix/skills/{name}/ (source of truth)
            const aixSkillDir = join(projectRoot, '.aix', 'skills', name),
                  aixExists = existsSync(aixSkillDir);

            if (!options.dryRun) {
               await mkdir(dirname(aixSkillDir), { recursive: true });
               await cp(skill.basePath, aixSkillDir, { recursive: true, force: true });
            }

            changes.push({
               path: aixSkillDir,
               action: aixExists ? 'update' : 'create',
               content: `[skill directory: ${skill.basePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            // 2. Create symlink from editor skills dir to .aix/skills/{name}
            const editorSkillPath = join(projectRoot, this.editorSkillsDir, name),
                  relativePath = relative(dirname(editorSkillPath), aixSkillDir);

            let symlinkExists = false;

            try {
               const stats = await lstat(editorSkillPath);

               symlinkExists = stats.isSymbolicLink() || stats.isDirectory();
            } catch {
               // Path doesn't exist
            }

            if (!options.dryRun) {
               await mkdir(dirname(editorSkillPath), { recursive: true });
               if (symlinkExists) {
                  await safeRm(editorSkillPath, { force: true });
               }
               await symlink(relativePath, editorSkillPath);
            }

            changes.push({
               path: editorSkillPath,
               action: symlinkExists ? 'update' : 'create',
               content: `[symlink → ${relativePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            return changes;
         },
         { concurrency: 5 },
      );

      return nestedChanges.flat();
   }

   generateSkillRules(_skills: Map<string, ParsedSkill>): EditorRule[] {
      // Native skills don't need pointer rules - the editor reads skills directly
      return [];
   }
}
