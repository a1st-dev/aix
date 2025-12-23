import pMap from 'p-map';
import { readFile } from 'node:fs/promises';
import { join } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { LoadedRule } from './loader.js';

/**
 * Generate a rule that points the AI to an installed skill. Skills are installed to
 * `.aix/skills/{name}/` preserving their full directory structure (SKILL.md, scripts/,
 * references/, etc.). This rule tells the AI where to find the skill and what it does.
 */
export async function loadSkillRules(skill: ParsedSkill, _editor?: string): Promise<LoadedRule[]> {
   const rules: LoadedRule[] = [],
         skillName = skill.frontmatter.name,
         description = skill.frontmatter.description || 'No description provided';

   // Generate a pointer rule that tells the AI about this skill
   // The actual skill content lives in .aix/skills/{name}/ and preserves the full structure
   // Note: The rule name is added as a heading by the editor adapter, so we start with description
   const pointerContent = `${description}

## Location

This skill is installed at \`.aix/skills/${skillName}/\`. Read the \`SKILL.md\` file there for full instructions.

## Quick Reference

- **Instructions**: \`.aix/skills/${skillName}/SKILL.md\`
- **Scripts**: \`.aix/skills/${skillName}/scripts/\` (if available)
- **References**: \`.aix/skills/${skillName}/references/\` (if available)

When you need to use this skill, read the SKILL.md file for detailed instructions.`;

   rules.push({
      name: `skill-${skillName}`,
      content: pointerContent,
      source: 'file',
      sourcePath: `${skillName}:pointer`,
      metadata: {
         description,
         activation: 'always',
      },
   });

   // Also load any editor-specific rules from the skill's rules/ directory
   // Try each path in order, use the first one that exists
   const editorRulePaths = ['rules/global.md', 'RULES.md'];

   for (const rulePath of editorRulePaths) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential: first-match lookup
         const content = await readFile(join(skill.basePath, rulePath), 'utf-8');

         rules.push({
            name: `${skillName}-rules`,
            content: content.trim(),
            source: 'file',
            sourcePath: `${skillName}:${rulePath}`,
            metadata: {
               activation: 'always',
            },
         });
         break;
      } catch {
         // File doesn't exist, continue
      }
   }

   return rules;
}

/**
 * Load rules from all skills
 */
export async function loadAllSkillRules(skills: ParsedSkill[], editor?: string): Promise<LoadedRule[]> {
   const nestedRules = await pMap(skills, (skill) => loadSkillRules(skill, editor), {
      concurrency: 5,
   });

   return nestedRules.flat();
}
