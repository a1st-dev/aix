import type { SearchResult } from './types.js';
import { isValidSkillName, normalizeSkillName } from '../skill-source.js';

interface SkillsLibraryMeta {
   id?: string;
   source?: string;
   skillId?: string;
}

interface GitHubDirEntry {
   name?: string;
   type?: string;
}

export interface SkillInstallRequest {
   name: string;
   source: string;
}

function toSafeSkillName(name: string): string {
   return isValidSkillName(name) ? name : normalizeSkillName(name);
}

function parseSkillsLibraryMeta(result: SearchResult): SkillsLibraryMeta {
   return (result.meta ?? {}) as SkillsLibraryMeta;
}

function unique(values: Array<string | undefined>): string[] {
   return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function scoreDirectoryMatch(dirName: string, names: string[]): number {
   let bestScore = 0;

   for (const name of names) {
      if (dirName === name) {
         bestScore = Math.max(bestScore, 100);
      } else if (name.endsWith(`-${dirName}`)) {
         bestScore = Math.max(bestScore, 80);
      } else if (dirName.endsWith(`-${name}`)) {
         bestScore = Math.max(bestScore, 60);
      } else if (dirName.includes(name) || name.includes(dirName)) {
         bestScore = Math.max(bestScore, 40);
      }
   }

   return bestScore;
}

async function resolveSkillsLibrarySource(result: SearchResult): Promise<string> {
   const meta = parseSkillsLibraryMeta(result),
         repo = meta.source,
         skillId = meta.skillId ?? result.name;

   if (!repo) {
      return String(meta.id ?? result.name);
   }

   const normalizedSkillId = normalizeSkillName(skillId),
         normalizedResultName = normalizeSkillName(result.name),
         fallbackPath = normalizedSkillId || normalizedResultName;

   const match = repo.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);

   if (!match) {
      return `${repo}/skills/${fallbackPath}`;
   }

   try {
      const [, owner, name] = match,
            response = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/skills`);

      if (!response.ok) {
         return `${repo}/skills/${fallbackPath}`;
      }

      const entries = (await response.json()) as GitHubDirEntry[],
            skillDirs = entries.filter((entry) => entry.type === 'dir' && typeof entry.name === 'string');

      if (skillDirs.length === 0) {
         return `${repo}/skills/${fallbackPath}`;
      }

      const candidateNames = unique([
         toSafeSkillName(skillId),
         normalizedSkillId,
         normalizedResultName,
         normalizeSkillName(skillId.replace(/^.*\//, '')),
         normalizeSkillName(result.name.replace(/^.*\//, '')),
      ]);

      const bestMatch = skillDirs
         .map((entry) => ({
            name: entry.name!,
            score: scoreDirectoryMatch(entry.name!, candidateNames),
         }))
         .filter((entry) => entry.score > 0)
         .toSorted((left, right) => right.score - left.score || left.name.localeCompare(right.name))[0];

      return `${repo}/skills/${bestMatch?.name ?? fallbackPath}`;
   } catch {
      return `${repo}/skills/${fallbackPath}`;
   }
}

export async function getSkillInstallRequest(result: SearchResult): Promise<SkillInstallRequest> {
   if (result.source === 'skills-library') {
      return {
         name: toSafeSkillName(result.name),
         source: await resolveSkillsLibrarySource(result),
      };
   }

   const meta = parseSkillsLibraryMeta(result);

   return {
      name: toSafeSkillName(result.name),
      source: String(meta.id ?? result.name),
   };
}
