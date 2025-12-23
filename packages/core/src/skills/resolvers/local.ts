import { stat } from 'node:fs/promises';
import { resolve } from 'pathe';
import { parseSkillMd } from '../parser.js';
import type { LocalRef } from '../reference-parser.js';
import type { ParsedSkill } from '@a1st/aix-schema';

/**
 * Resolve a skill from a local file path
 */
export async function resolveLocal(ref: LocalRef, baseDir: string): Promise<ParsedSkill> {
   const skillPath = resolve(baseDir, ref.path);

   // Check if path exists and is a directory
   const stats = await stat(skillPath);

   if (!stats.isDirectory()) {
      throw new Error(`Skill path is not a directory: ${skillPath}`);
   }

   return parseSkillMd(skillPath, 'local');
}
