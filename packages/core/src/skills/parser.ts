import { readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { parse as parseYaml } from 'yaml';
import { skillFrontmatterSchema, type ParsedSkill } from '@a1st/aix-schema';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Parse a SKILL.md file from a skill directory
 */
export async function parseSkillMd(
   skillPath: string,
   source: ParsedSkill['source'],
): Promise<ParsedSkill> {
   const skillMdPath = join(skillPath, 'SKILL.md');
   const content = await readFile(skillMdPath, 'utf-8');

   const match = content.match(FRONTMATTER_REGEX);

   if (!match) {
      throw new Error(`Invalid SKILL.md format: missing frontmatter in ${skillMdPath}`);
   }

   const yamlContent = match[1],
         body = match[2];

   if (!yamlContent || body === undefined) {
      throw new Error(`Invalid SKILL.md format: could not parse frontmatter in ${skillMdPath}`);
   }

   const rawFrontmatter = parseYaml(yamlContent) as unknown,
         frontmatter = skillFrontmatterSchema.parse(rawFrontmatter);

   return {
      frontmatter,
      body: body.trim(),
      basePath: skillPath,
      source,
   };
}
