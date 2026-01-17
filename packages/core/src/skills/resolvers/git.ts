import { downloadTemplate } from 'giget';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import { parseSkillMd } from '../parser.js';
import type { GitRef } from '../reference-parser.js';
import type { ParsedSkill } from '@a1st/aix-schema';

/**
 * Resolve a skill from a git repository.
 * Uses giget for downloading which handles caching internally.
 */
export async function resolveGit(ref: GitRef): Promise<ParsedSkill> {
   const cacheKey = createCacheKey(ref),
         cachePath = join(tmpdir(), 'aix-skills', 'git', cacheKey);

   // Build giget source string
   // giget supports: gh:user/repo, gitlab:user/repo, bitbucket:user/repo, https://...
   let source = ref.url;

   // Convert various URL formats to giget format
   if (source.startsWith('https://github.com/')) {
      source = source.replace('https://github.com/', 'gh:');
   } else if (source.startsWith('https://gitlab.com/')) {
      source = source.replace('https://gitlab.com/', 'gitlab:');
   } else if (source.startsWith('https://bitbucket.org/')) {
      source = source.replace('https://bitbucket.org/', 'bitbucket:');
   } else if (source.startsWith('github:')) {
      // Convert our shorthand to giget's format
      source = source.replace('github:', 'gh:');
   }
   // gitlab: and bitbucket: are already in giget format

   // Add subdirectory path if specified
   if (ref.path) {
      source = `${source}/${ref.path}`;
   }

   // Add ref (branch/tag/commit) if specified
   if (ref.ref) {
      source = `${source}#${ref.ref}`;
   }

   // Download using giget
   await downloadTemplate(source, {
      dir: cachePath,
      force: true,
   });

   return parseSkillMd(cachePath, 'git');
}

/**
 * Create a cache key for a git reference
 */
function createCacheKey(ref: GitRef): string {
   const urlHash = Buffer.from(ref.url).toString('base64url').slice(0, 16),
         refPart = ref.ref ?? 'default',
         pathPart = ref.path ? `-${ref.path.replace(/\//g, '-')}` : '';

   return `${urlHash}-${refPart}${pathPart}`;
}
