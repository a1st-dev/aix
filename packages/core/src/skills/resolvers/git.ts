import { join } from 'pathe';
import { parseSkillMd } from '../parser.js';
import type { GitRef } from '../reference-parser.js';
import type { ParsedSkill } from '@a1st/aix-schema';
import { getRuntimeAdapter, type RuntimeDirent } from '../../runtime/index.js';

/** Maximum directory depth to search for a nested SKILL.md when no subpath is specified. */
const MAX_SKILL_SEARCH_DEPTH = 5;

/**
 * Resolve a skill from a git repository.
 * Uses giget for downloading which handles caching internally.
 */
export async function resolveGit(ref: GitRef): Promise<ParsedSkill> {
   const cacheKey = createCacheKey(ref),
         cachePath = join(getRuntimeAdapter().os.tmpdir(), 'aix-skills', 'git', cacheKey);

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
   await getRuntimeAdapter().git.downloadTemplate(source, {
      dir: cachePath,
      force: true,
   });

   const skillDir = await findSkillDirectory(cachePath);

   return parseSkillMd(skillDir, 'git');
}

/**
 * Locate the skill directory inside a downloaded repo. When no subpath is specified, the repo may
 * nest its skill under a common layout (e.g. "skills/<name>/" or "<name>/") instead of the root.
 * When multiple SKILL.md files exist, the shallowest is preferred.
 */
async function findSkillDirectory(cachePath: string): Promise<string> {
   if (getRuntimeAdapter().fs.existsSync(join(cachePath, 'SKILL.md'))) {
      return cachePath;
   }

   const matches: Array<{ depth: number; dir: string }> = [];

   await searchForSkillDirs(cachePath, 0, matches);

   if (matches.length === 0) {
      throw new Error(
         `SKILL.md not found in "${cachePath}". Ensure the directory contains a SKILL.md file.`,
      );
   }

   matches.sort((a, b) => a.depth - b.depth || a.dir.localeCompare(b.dir));

   return matches[0]!.dir;
}

/**
 * Recursively collect directories containing a SKILL.md file, bounded by depth.
 */
async function searchForSkillDirs(
   dir: string,
   depth: number,
   matches: Array<{ depth: number; dir: string }>,
): Promise<void> {
   if (depth >= MAX_SKILL_SEARCH_DEPTH) {
      return;
   }

   let entries: RuntimeDirent[];

   try {
      entries = await getRuntimeAdapter().fs.readdir(dir, { withFileTypes: true });
   } catch {
      return;
   }

   const subdirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name));

   await Promise.all(
      subdirs.map(async (subdir) => {
         if (getRuntimeAdapter().fs.existsSync(join(subdir, 'SKILL.md'))) {
            matches.push({ depth: depth + 1, dir: subdir });

            return;
         }

         await searchForSkillDirs(subdir, depth + 1, matches);
      }),
   );
}

/**
 * Create a cache key for a git reference
 */
function createCacheKey(ref: GitRef): string {
   const urlHash = getRuntimeAdapter().crypto.base64url(ref.url).slice(0, 16),
         refPart = ref.ref ?? 'default',
         pathPart = ref.path ? `-${ref.path.replace(/\//g, '-')}` : '';

   return `${urlHash}-${refPart}${pathPart}`;
}
