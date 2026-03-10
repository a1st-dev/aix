import { execa } from 'execa';
import { join } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy, NativeSkillsConfig } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';

/**
 * Native skills strategy for editors that support Agent Skills natively (Claude Code, GitHub Copilot,
 * Cursor). Uses the `skills` CLI (vercel-labs/skills) to handle robust multi-agent installation.
 * The source of truth is aligned with the industry-standard `.agents/skills/` directory.
 * Skills are physically copied to the agent's skills directory to ensure maximum compatibility.
 */
export class NativeSkillsStrategy implements SkillsStrategy {
   private editorName: string;

   constructor(config: NativeSkillsConfig) {
      // Map aix editor names to skills CLI agent names
      const mapping: Record<string, string> = {
         'claude-code': 'claude-code',
         cursor: 'cursor',
         windsurf: 'windsurf',
         copilot: 'github-copilot',
         'github-copilot': 'github-copilot',
         zed: 'zed',
         codex: 'codex',
      };

      this.editorName = mapping[config.editorName] || config.editorName;
   }

   getSkillsDir(): string {
      return '.agents/skills';
   }

   isNative(): boolean {
      return true;
   }

   async installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean } = {},
   ): Promise<FileChange[]> {
      const skillNames = Array.from(skills.keys());

      if (options.dryRun) {
         return skillNames.map((name) => ({
            path: join('.agents/skills', name),
            action: 'update',
            content: `[npx skills experimental_install --agent ${this.editorName} --mode copy]`,
            isDirectory: true,
            category: 'skill',
         }));
      }

      try {
         // Use the skills CLI from node_modules to handle the entire installation process.
         // This is more robust as it supports 40+ agents.
         // We use --mode copy to ensure files are physically copied instead of symlinked.
         const binPath = join(projectRoot, 'node_modules', '.bin', 'skills');

         await execa(binPath, ['experimental_install', '--agent', this.editorName, '--mode', 'copy', '-y'], {
            cwd: projectRoot,
         });


         return skillNames.map((name) => ({
            path: join('.agents/skills', name),
            action: 'update',
            content: `[Synced via skills CLI]`,
            isDirectory: true,
            category: 'skill',
         }));
      } catch (error) {
         console.warn(`Failed to install skills for ${this.editorName} using skills CLI:`, error);
         return [];
      }
   }

   generateSkillRules(_skills: Map<string, ParsedSkill>): EditorRule[] {
      // Native skills don't need pointer rules - the editor reads skills directly
      return [];
   }
}
