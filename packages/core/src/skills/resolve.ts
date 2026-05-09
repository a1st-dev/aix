import pMap from 'p-map';
import type { ParsedSkill } from '@a1st/aix-schema';
import { parseSkillRef, type SkillRef } from './reference-parser.js';
import { resolveLocal } from './resolvers/local.js';
import { resolveGit } from './resolvers/git.js';
import { resolveNpm } from './resolvers/npm.js';

export interface SkillResolveOptions {
   /** Base directory for resolving relative paths */
   baseDir: string;
   /** Project root for npm resolution */
   projectRoot?: string;
}

/**
 * Resolve a skill reference to a parsed skill
 */
export async function resolveSkill(
   name: string,
   ref: unknown,
   options: SkillResolveOptions,
): Promise<ParsedSkill> {
   const parsed = parseSkillRef(name, ref),
         projectRoot = options.projectRoot ?? options.baseDir;

   return resolveSkillRef(parsed, options.baseDir, projectRoot);
}

/**
 * Resolve a parsed skill reference
 */
export async function resolveSkillRef(
   ref: SkillRef,
   baseDir: string,
   projectRoot: string,
): Promise<ParsedSkill> {
   switch (ref.type) {
      case 'local':
         return resolveLocal(ref, baseDir);
      case 'git':
         return resolveGit(ref);
      case 'npm':
         return resolveNpm(ref, projectRoot);
   }
}

/**
 * Resolve all skills from a config's skills map
 */
export async function resolveAllSkills(
   skills: Record<string, unknown>,
   options: SkillResolveOptions,
): Promise<Map<string, ParsedSkill>> {
   const entries = Object.entries(skills).filter(([, ref]) => ref !== false);

   const resolved = await pMap(
      entries,
      async ([name, ref]) => {
         try {
            const skill = await resolveSkill(name, ref, options);

            return { name, skill };
         } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to resolve skill "${name}": ${message}`, { cause: error });
         }
      },
      { concurrency: 5 },
   );

   return new Map(resolved.map(({ name, skill }) => [name, skill]));
}
