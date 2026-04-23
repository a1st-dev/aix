import { join, basename } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';
import { getRuntimeAdapter } from '../runtime/index.js';

export interface ValidationResult {
   valid: boolean;
   errors: string[];
   warnings: string[];
}

const OPTIONAL_DIRS = ['scripts', 'references', 'assets'];

/**
 * Validate a parsed skill for completeness and correctness
 */
export async function validateSkill(skill: ParsedSkill): Promise<ValidationResult> {
   const errors: string[] = [],
         warnings: string[] = [];

   // Validate SKILL.md exists (should already be parsed, but double-check)
   const skillMdPath = join(skill.basePath, 'SKILL.md');

   try {
      await getRuntimeAdapter().fs.access(skillMdPath, getRuntimeAdapter().fs.constants.R_OK);
   } catch {
      errors.push('SKILL.md not found');
   }

   // Validate name matches directory name (warning only)
   const dirName = basename(skill.basePath);

   if (dirName && dirName !== skill.frontmatter.name) {
      warnings.push(`Skill name "${skill.frontmatter.name}" does not match directory name "${dirName}"`);
   }

   // Check optional directories exist if present
   const files = await getRuntimeAdapter().fs.readdir(skill.basePath),
         dirsToCheck = OPTIONAL_DIRS.filter((dir) => files.includes(dir)),
         accessResults = await Promise.all(
            dirsToCheck.map(async (dir) => {
               try {
                  await getRuntimeAdapter().fs.access(join(skill.basePath, dir), getRuntimeAdapter().fs.constants.R_OK);
                  return null;
               } catch {
                  return `Cannot access ${dir}/ directory`;
               }
            }),
         );

   errors.push(...accessResults.filter((e): e is string => e !== null));

   // Check description quality
   if (skill.frontmatter.description && skill.frontmatter.description.length < 50) {
      warnings.push('Description is short - consider adding more detail for better AI discovery');
   }

   return {
      valid: errors.length === 0,
      errors,
      warnings,
   };
}
