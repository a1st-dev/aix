import type { ParsedSkill } from '@a1st/aix-schema';
import { convertPromptsToSkills } from '../prompts/to-skills.js';
import type { ApplyOptions, EditorConfig, FileChange } from './types.js';
import type { SkillsStrategy } from './strategies/types.js';

interface InstallPromptsAsSkillsOptions {
   prompts: EditorConfig['prompts'];
   skills: Map<string, ParsedSkill>;
   skillsStrategy: SkillsStrategy;
   projectRoot: string;
   applyOptions: ApplyOptions;
}

/**
 * Install prompts as generated skills for editors that need a skill-backed prompt surface at the
 * requested scope.
 */
export async function installPromptsAsSkills(options: InstallPromptsAsSkillsOptions): Promise<FileChange[]> {
   const { prompts, skills, skillsStrategy, projectRoot, applyOptions } = options,
         scopes = applyOptions.scopes ?? ['rules', 'mcp', 'skills', 'editors'];

   if (prompts.length === 0 || (!scopes.includes('editors') && !scopes.includes('prompts'))) {
      return [];
   }

   const existingSkillNames = new Set<string>();

   for (const [name, skill] of skills) {
      existingSkillNames.add(name);
      if (skill.frontmatter.name) {
         existingSkillNames.add(skill.frontmatter.name);
      }
   }

   const { skills: promptSkills } = await convertPromptsToSkills(prompts, {
      existingSkillNames,
   });

   return skillsStrategy.installSkills(promptSkills, projectRoot, applyOptions);
}
