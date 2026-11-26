import pMap from 'p-map';
import { join, dirname, relative, resolve } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy, NativeSkillsConfig } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';
import { safeRm } from '../../../fs/safe-rm.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { listInstalledPaths } from '../../install-receipts.js';
import { getReplacementAction, replaceSkillDirectory } from './skill-directory.js';

/**
 * Whether something aix may replace already sits at the editor's path for a skill. A symlink
 * holds no content of its own, and a receipt marks a directory as one aix created. Anything
 * else was written by the user or another tool, so replacing it would destroy their skill.
 */
async function hasReplaceableEntry(path: string, skillName: string, installedPaths: ReadonlySet<string>): Promise<boolean> {
   const { fs } = getRuntimeAdapter();
   let isSymlink: boolean;

   try {
      isSymlink = (await fs.lstat(path)).isSymbolicLink();
   } catch {
      return false;
   }

   if (!isSymlink && !installedPaths.has(path)) {
      throw new Error(
         `Cannot install skill "${skillName}": ${path} already exists and was not created by aix. ` +
         'Move or delete it, then install again.',
      );
   }

   return true;
}

/**
 * Native skills strategy for editors that support Agent Skills natively (Claude Code, GitHub Copilot,
 * Cursor, Windsurf, and Codex). Skills are copied into `.aix/skills/` as aix's canonical managed
 * store, then linked into each editor's native skills directory.
 */
export class NativeSkillsStrategy implements SkillsStrategy {
   private readonly editorSkillsDir: string;
   private readonly userEditorSkillsDir: string;
   private readonly projectImportDirs: readonly string[];
   private readonly globalImportDirs: readonly string[];

   constructor(config: NativeSkillsConfig) {
      this.editorSkillsDir = config.editorSkillsDir;
      this.userEditorSkillsDir = config.userEditorSkillsDir ?? config.editorSkillsDir;
      this.projectImportDirs = config.projectImportDirs ?? [this.editorSkillsDir];
      this.globalImportDirs = config.globalImportDirs ?? [this.userEditorSkillsDir];
   }

   getSkillsDir(): string {
      return '.aix/skills';
   }

   getProjectImportDirs(): readonly string[] {
      return this.projectImportDirs;
   }

   getGlobalImportDirs(): readonly string[] {
      return this.globalImportDirs;
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
            scope = options.targetScope ?? 'project',
            installRoot = scope === 'user' ? getRuntimeAdapter().os.homedir() : projectRoot,
            editorSkillsDir = scope === 'user' ? this.userEditorSkillsDir : this.editorSkillsDir,
            installedPaths = await listInstalledPaths({ scope, projectRoot });

      const nestedChanges = await pMap(
         entries,
         async ([name, skill]) => {
            const changes: FileChange[] = [],
                  aixSkillDir = join(installRoot, '.aix', 'skills', name);
            let aixAction: 'create' | 'update';

            if (!options.dryRun) {
               aixAction = await replaceSkillDirectory(skill.basePath, aixSkillDir);
            } else {
               aixAction = await getReplacementAction(aixSkillDir);
            }

            changes.push({
               path: aixSkillDir,
               action: aixAction,
               content: `[skill directory: ${skill.basePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            const editorSkillPath = resolve(installRoot, editorSkillsDir, name),
                  relativePath = relative(dirname(editorSkillPath), aixSkillDir);

            const linkExists = await hasReplaceableEntry(editorSkillPath, name, installedPaths);

            if (!options.dryRun) {
               await getRuntimeAdapter().fs.mkdir(dirname(editorSkillPath), { recursive: true });
               if (linkExists) {
                  await safeRm(editorSkillPath, { force: true });
               }
               await getRuntimeAdapter().fs.symlink(relativePath, editorSkillPath);
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
