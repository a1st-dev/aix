import pMap from 'p-map';
import { mkdir, cp, symlink, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, relative } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy, NativeSkillsConfig } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';
import { safeRm } from '../../../fs/safe-rm.js';

/**
 * Native skills strategy for editors that support Agent Skills natively (Claude Code, GitHub Copilot,
 * Cursor, Windsurf, and Codex). Skills are copied into `.aix/skills/` as aix's canonical managed
 * store, then linked into each editor's native skills directory.
 */
export class NativeSkillsStrategy implements SkillsStrategy {
   private readonly editorSkillsDir: string;
   private readonly userEditorSkillsDir: string;

   constructor(config: NativeSkillsConfig) {
      this.editorSkillsDir = config.editorSkillsDir;
      this.userEditorSkillsDir = config.userEditorSkillsDir ?? config.editorSkillsDir;
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
      options: { dryRun?: boolean; targetScope?: 'project' | 'user' } = {},
   ): Promise<FileChange[]> {
      const entries = Array.from(skills.entries()),
            installRoot = options.targetScope === 'user' ? homedir() : projectRoot,
            editorSkillsDir = options.targetScope === 'user' ? this.userEditorSkillsDir : this.editorSkillsDir;

      const nestedChanges = await pMap(
         entries,
         async ([name, skill]) => {
            const changes: FileChange[] = [],
                  aixSkillDir = join(installRoot, '.aix', 'skills', name),
                  aixExists = existsSync(aixSkillDir);

            if (!options.dryRun) {
               await mkdir(dirname(aixSkillDir), { recursive: true });
               if (aixExists) {
                  await safeRm(aixSkillDir, { force: true });
               }
               await cp(skill.basePath, aixSkillDir, { recursive: true, force: true });
            }

            changes.push({
               path: aixSkillDir,
               action: aixExists ? 'update' : 'create',
               content: `[skill directory: ${skill.basePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            const editorSkillPath = join(installRoot, editorSkillsDir, name),
                  relativePath = relative(dirname(editorSkillPath), aixSkillDir);

            let linkExists = false;

            try {
               const stats = await lstat(editorSkillPath);

               linkExists = stats.isSymbolicLink() || stats.isDirectory();
            } catch {
               // Path does not exist yet.
            }

            if (!options.dryRun) {
               await mkdir(dirname(editorSkillPath), { recursive: true });
               if (linkExists) {
                  await safeRm(editorSkillPath, { force: true });
               }
               await symlink(relativePath, editorSkillPath);
            }

            changes.push({
               path: editorSkillPath,
               action: linkExists ? 'update' : 'create',
               content: `[symlink -> ${relativePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            return changes;
         },
         { concurrency: 5 },
      );

      return nestedChanges.flat();
   }

   generateSkillRules(_skills: Map<string, ParsedSkill>, _options?: { targetScope?: 'project' | 'user' }): EditorRule[] {
      return [];
   }
}
