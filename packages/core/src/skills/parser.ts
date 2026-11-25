import { join, basename } from 'pathe';
import { skillFrontmatterSchema, type ParsedSkill, type SkillFrontmatter } from '@a1st/aix-schema';
import { extractFrontmatter, parseAllFrontmatter } from '../frontmatter-utils.js';
import { getRuntimeAdapter } from '../runtime/index.js';

/**
 * Parse a SKILL.md file from a skill directory. Frontmatter is optional - if missing, the entire
 * content is treated as the body. If no name is provided in frontmatter, the parent folder name is
 * used as the skill name.
 */
export async function parseSkillMd(
   skillPath: string,
   source: ParsedSkill['source'],
): Promise<ParsedSkill> {
   const skillMdPath = join(skillPath, 'SKILL.md');

   if (!getRuntimeAdapter().fs.existsSync(skillMdPath)) {
      throw new Error(
         `SKILL.md not found in "${skillPath}". Ensure the directory contains a SKILL.md file.`,
      );
   }

   const rawContent = await getRuntimeAdapter().fs.readFile(skillMdPath, 'utf-8'),
         { frontmatter: yamlContent, content } = extractFrontmatter(rawContent),
         body = content.trim(),
         folderName = basename(skillPath);

   // No frontmatter, or an empty block - treat the content as the body and use the folder name
   if (!yamlContent.trim()) {
      return {
         frontmatter: { name: folderName },
         body,
         basePath: skillPath,
         source,
      };
   }

   const rawFrontmatter = parseAllFrontmatter(yamlContent),
         parsed = skillFrontmatterSchema.parse(rawFrontmatter),
         frontmatter: SkillFrontmatter = parsed.name ? parsed : { ...parsed, name: folderName };

   return {
      frontmatter,
      body,
      basePath: skillPath,
      source,
   };
}
