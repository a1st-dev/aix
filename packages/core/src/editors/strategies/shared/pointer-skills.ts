import pMap from 'p-map';
import { mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { SkillsStrategy } from '../types.js';
import type { EditorRule, FileChange } from '../../types.js';

/**
 * Pointer skills strategy for editors without native Agent Skills support (Windsurf, Cursor, Zed).
 * Copies skills to `.aix/skills/` and generates pointer rules that tell the AI where to find the
 * skill.
 */
export class PointerSkillsStrategy implements SkillsStrategy {
   getSkillsDir(): string {
      return '.aix/skills';
   }

   isNative(): boolean {
      return false;
   }

   async installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean } = {},
   ): Promise<FileChange[]> {
      const entries = Array.from(skills.entries());

      const changes = await pMap(
         entries,
         async ([name, skill]) => {
            const aixSkillDir = join(projectRoot, '.aix', 'skills', name),
                  exists = existsSync(aixSkillDir);

            if (!options.dryRun) {
               await mkdir(dirname(aixSkillDir), { recursive: true });
               await cp(skill.basePath, aixSkillDir, { recursive: true, force: true });
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

   generateSkillRules(skills: Map<string, ParsedSkill>): EditorRule[] {
      const rules: EditorRule[] = [];

      for (const [name, skill] of skills) {
         const { frontmatter } = skill,
               skillName = frontmatter.name,
               description = frontmatter.description || 'No description provided';

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
            `This skill is installed at \`.aix/skills/${skillName}/\`. Read the \`SKILL.md\` file there for full instructions.`,
            '',
            '## Quick Reference',
            '',
            `- **Instructions**: \`.aix/skills/${skillName}/SKILL.md\``,
            `- **Scripts**: \`.aix/skills/${skillName}/scripts/\` (if available)`,
            `- **References**: \`.aix/skills/${skillName}/references/\` (if available)`,
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
