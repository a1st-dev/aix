import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { parseSkillMd } from '../parser.js';
import type { NpmRef } from '../reference-parser.js';
import type { ParsedSkill } from '@a1st/aix-schema';
import { resolveNpmPath } from '../../npm/resolve.js';

/**
 * Resolve an npm skill package.
 * Skills are directories containing SKILL.md and supporting files.
 *
 * Resolution modes:
 * - No version: Resolve from project's node_modules only (error if not found)
 * - With version: Auto-install to .aix/.tmp/node_modules cache
 */
export async function resolveNpm(ref: NpmRef, projectRoot: string): Promise<ParsedSkill> {
   const skillDir = await resolveNpmPath({
      packageName: ref.packageName,
      subpath: ref.path,
      version: ref.version,
      projectRoot,
   });

   // Verify SKILL.md exists in the resolved directory
   const skillMdPath = join(skillDir, 'SKILL.md');

   if (!existsSync(skillMdPath)) {
      throw new Error(
         `SKILL.md not found in ${skillDir}. ` +
            `Ensure the package exports a skill directory at "${ref.path || '(root)'}".`,
      );
   }

   return parseSkillMd(skillDir, 'npm');
}
