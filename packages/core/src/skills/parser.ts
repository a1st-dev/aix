import { readFile } from 'node:fs/promises';
import { join, basename } from 'pathe';
import { parse as parseYaml } from 'yaml';
import { skillFrontmatterSchema, type ParsedSkill, type SkillFrontmatter } from '@a1st/aix-schema';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Parse a SKILL.md file from a skill directory. Frontmatter is optional - if missing, the entire
 * content is treated as the body. If no name is provided in frontmatter, the parent folder name is
 * used as the skill name.
 */
export async function parseSkillMd(
   skillPath: string,
   source: ParsedSkill['source'],
): Promise<ParsedSkill> {
   const skillMdPath = join(skillPath, 'SKILL.md'),
         content = await readFile(skillMdPath, 'utf-8'),
         match = content.match(FRONTMATTER_REGEX),
         folderName = basename(skillPath);

   // No frontmatter - treat entire content as body, use folder name
   if (!match) {
      return {
         frontmatter: { name: folderName },
         body: content.trim(),
         basePath: skillPath,
         source,
      };
   }

   const yamlContent = match[1],
         body = match[2];

   // Empty frontmatter block (---\n---) - treat as no frontmatter
   if (!yamlContent?.trim()) {
      return {
         frontmatter: { name: folderName },
         body: (body ?? '').trim(),
         basePath: skillPath,
         source,
      };
   }

   const rawFrontmatter = parseYaml(yamlContent) as unknown,
         parsed = skillFrontmatterSchema.parse(rawFrontmatter),
         frontmatter: SkillFrontmatter = parsed.name ? parsed : { ...parsed, name: folderName };

   return {
      frontmatter,
      body: (body ?? '').trim(),
      basePath: skillPath,
      source,
   };
}
