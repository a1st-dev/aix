import pMap from 'p-map';
import { join, dirname } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';
import { safeRm } from '../../../fs/safe-rm.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

/**
 * Pointer skills strategy for editors without native Agent Skills support (currently Zed).
 * Copies skills to `.aix/skills/` and generates pointer rules that tell the AI where to find the
 * skill.
 */
export class PointerSkillsStrategy implements SkillsStrategy {
   getSkillsDir(): string {
      return '.aix/skills';
   }

   getProjectImportDirs(): readonly string[] {
      return [this.getSkillsDir()];
   }

   getGlobalImportDirs(): readonly string[] {
      return [];
   }

   isNative(): boolean {
      return false;
   }

   async installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean; targetScope?: 'project' | 'user' } = {},
   ): Promise<FileChange[]> {
      const entries = Array.from(skills.entries()),
            installRoot = options.targetScope === 'user' ? getRuntimeAdapter().os.homedir() : projectRoot;

      const changes = await pMap(
         entries,
         async ([name, skill]) => {
            const aixSkillDir = join(installRoot, '.aix', 'skills', name),
                  exists = getRuntimeAdapter().fs.existsSync(aixSkillDir);

            if (!options.dryRun) {
               await getRuntimeAdapter().fs.mkdir(dirname(aixSkillDir), { recursive: true });
               if (exists) {
                  await safeRm(aixSkillDir, { force: true });
               }
               await getRuntimeAdapter().fs.cp(skill.basePath, aixSkillDir, { recursive: true, force: true });
            }

            return {
               path: aixSkillDir,
               action: exists ? 'update' : 'create',
               content: `[skill directory: ${skill.basePath}]`,
               isDirectory: true,
               category: 'skill',
            } as FileChange;
         },
         { concurrency: 5 },
      );

      return changes;
   }

   generateSkillRules(
      skills: Map<string, ParsedSkill>,
      options: { targetScope?: 'project' | 'user' } = {},
   ): EditorRule[] {
      const rules: EditorRule[] = [];

      for (const [name, skill] of skills) {
         const { frontmatter } = skill,
               description = frontmatter.description || 'No description provided',
               skillPath =
                  options.targetScope === 'user'
                     ? join(getRuntimeAdapter().os.homedir(), '.aix', 'skills', name)
                     : `.aix/skills/${name}`;

         // Build contextual sections from frontmatter
         // Note: Don't add a header here - the editor's rules strategy will add one based on rule.name
         const sections: string[] = [description];

         // Add compatibility info if present
         if (frontmatter.compatibility) {
            sections.push('', `**Compatibility**: ${frontmatter.compatibility}`);
         }

         // Add license info if present
         if (frontmatter.license) {
            sections.push('', `**License**: ${frontmatter.license}`);
         }

         // Add allowed tools if specified
         if (frontmatter['allowed-tools']) {
            sections.push('', `**Allowed Tools**: ${frontmatter['allowed-tools']}`);
         }

         // Add any custom metadata
         if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
            sections.push('', '## Metadata');
            for (const [key, value] of Object.entries(frontmatter.metadata)) {
               sections.push(`- **${key}**: ${value}`);
            }
         }

         // Add location and quick reference
         sections.push(
            '',
            '## Location',
            '',
            `This skill is installed at \`${skillPath}/\`. Read the \`SKILL.md\` file there for full instructions.`,
            '',
            '## Quick Reference',
            '',
            `- **Instructions**: \`${skillPath}/SKILL.md\``,
            `- **Scripts**: \`${skillPath}/scripts/\` (if available)`,
            `- **References**: \`${skillPath}/references/\` (if available)`,
            '',
            'When you need to use this skill, read the SKILL.md file for detailed instructions.',
         );

         rules.push({
            name: `skill-${name}`,
            content: sections.join('\n'),
            activation: { type: 'always' },
         });
      }

      return rules;
   }
}
