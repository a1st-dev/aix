/**
 * Unified reference resolution for all asset types (rules, prompts, skills, configs).
 * This is the single entry point for parsing source strings into structured references.
 * CLI commands should use this instead of inline parseSource() functions.
 */

import { type SourceType, detectSourceType, isLocalPath } from '@a1st/aix-schema';

import {
   type GitHubTreeUrl,
   type GitHubBlobUrl,
   type GitHubRepoUrl,
   type GitShorthand,
   parseGitHubTreeUrl,
   parseGitHubBlobUrl,
   parseGitHubRepoUrl,
   parseGitShorthand,
   isGenericGitUrl,
   inferNameFromPath,
   buildGitHubUrl,
   buildProviderUrl,
} from './url-parsing.js';

/**
 * Asset types that affect how references are resolved.
 * - 'rule': prefers tree URLs (directories), infers name from subdirectory
 * - 'prompt': prefers blob URLs (files), infers name from file path
 * - 'skill': similar to rule, directories with SKILL.md
 * - 'config': references to ai.json files, normalizes to shorthand
 */
export type AssetType = 'rule' | 'prompt' | 'skill' | 'config';

/** Default file extensions to strip when inferring names, by asset type */
const EXTENSIONS_BY_TYPE: Record<AssetType, string[]> = {
   rule: ['.md', '.txt'],
   prompt: ['.md', '.prompt.md', '.txt'],
   skill: ['.md'],
   config: ['.json'],
};

/** Git reference object used in rule/prompt/skill values */
export interface GitReference {
   url: string;
   ref?: string;
   path?: string;
}

/**
 * A parsed source reference with the resolved value and inferred name.
 * The `type` field indicates what kind of source was detected.
 */
export interface ParsedReference {
   /** The type of source detected */
   sourceType: SourceType;
   /** How the reference was resolved */
   resolvedAs: 'local' | 'git' | 'content' | 'shorthand';
   /** The value suitable for use in ai.json (string shorthand, git object, or content object) */
   value: string | { git: GitReference } | { content: string } | { path: string };
   /** Inferred name from the source (e.g., directory name, file stem) */
   inferredName?: string;
   /** For config references: normalized shorthand (e.g., "github:org/repo") */
   normalizedRef?: string;
   /** Parsed git details for consumers that need them */
   gitDetails?: {
      owner?: string;
      repo?: string;
      ref?: string;
      path?: string;
      provider?: string;
   };
}

export interface ParseSourceOptions {
   /** The asset type being resolved (affects URL handling and name inference) */
   type: AssetType;
   /** Override git ref (branch/tag/commit) from URL */
   refOverride?: string;
   /** Custom extensions to strip for name inference (overrides defaults for asset type) */
   extensions?: string[];
}

/**
 * Parse a source string into a structured reference suitable for ai.json.
 * This is the unified entry point that consolidates duplicated parseSource() logic.
 *
 * Resolution order:
 * 1. Local paths → string shorthand or { path: ... }
 * 2. GitHub tree URLs → { git: { url, ref, path } } (for rules/skills)
 * 3. GitHub blob URLs → { git: { url, ref, path } } (for prompts)
 * 4. GitHub repo URLs → { git: { url } } or shorthand
 * 5. Git shorthand → { git: { url, ref?, path? } }
 * 6. Generic git URLs → string shorthand or { git: { url, ref } }
 * 7. Fallback → { content: source } (inline content)
 */
export function parseSourceReference(source: string, options: ParseSourceOptions): ParsedReference {
   const { type, refOverride } = options;
   const extensions = options.extensions ?? EXTENSIONS_BY_TYPE[type];

   // 1. Local file paths
   if (isLocalPath(source)) {
      return {
         sourceType: 'local',
         resolvedAs: 'local',
         value: source,
         inferredName: inferNameFromPath(source, extensions),
      };
   }

   // 2. GitHub tree URL (directories — primarily for rules/skills)
   const ghTree = parseGitHubTreeUrl(source);

   if (ghTree) {
      return resolveGitHubTree(ghTree, refOverride, extensions, type);
   }

   // 3. GitHub blob URL (files — primarily for prompts)
   const ghBlob = parseGitHubBlobUrl(source);

   if (ghBlob) {
      return resolveGitHubBlob(ghBlob, refOverride, extensions);
   }

   // 4. GitHub repo URL (no tree/blob path)
   const ghRepo = parseGitHubRepoUrl(source);

   if (ghRepo) {
      return resolveGitHubRepo(ghRepo, refOverride, type);
   }

   // 5. Git shorthand: github:user/repo/path#ref
   const shorthand = parseGitShorthand(source);

   if (shorthand) {
      return resolveGitShorthand(shorthand, refOverride, extensions, type);
   }

   // 6. Generic git URL (https://*.git, git@, git://)
   if (isGenericGitUrl(source)) {
      return resolveGenericGitUrl(source, refOverride, extensions);
   }

   // 7. Fallback: treat as inline content
   return {
      sourceType: detectSourceType(source),
      resolvedAs: 'content',
      value: { content: source },
      inferredName: undefined,
   };
}

/**
 * Validate and optionally normalize a reference string (for --extends, etc.).
 * Returns the normalized form if valid, throws if unrecognizable.
 */
export function validateReference(
   source: string,
   context: string = 'reference',
): {
   sourceType: SourceType;
   normalized: string;
} {
   const sourceType = detectSourceType(source);

   switch (sourceType) {
      case 'http-unsupported':
         throw new Error(`${context}: HTTP URLs are not supported (use HTTPS): ${source}`);
      case 'local':
         return { sourceType, normalized: source };
      case 'git-shorthand':
         return { sourceType, normalized: source };
      case 'https-repo': {
      // Try to normalize GitHub repo URLs to shorthand
         const ghRepo = parseGitHubRepoUrl(source);

         if (ghRepo) {
            return { sourceType, normalized: `github:${ghRepo.owner}/${ghRepo.repo}` };
         }
         // Check for tree URL (also an https-repo type)
         const ghTree = parseGitHubTreeUrl(source);

         if (ghTree) {
            const subpath = ghTree.subdir ? `/${ghTree.subdir}` : '';
            const ref = ghTree.ref !== 'main' && ghTree.ref !== 'master' ? `#${ghTree.ref}` : '';

            return {
               sourceType,
               normalized: `github:${ghTree.owner}/${ghTree.repo}${subpath}${ref}`,
            };
         }
         // Non-GitHub repo URL — keep as-is
         return { sourceType, normalized: source };
      }
      case 'https-file': {
      // Blob URLs could be normalized too, but keep as-is for clarity
         return { sourceType, normalized: source };
      }
      case 'npm':
         return { sourceType, normalized: source };
   }
}

/**
 * Detect if a source string represents a git-based reference (shorthand, tree, blob, repo URL).
 * Useful for pre-processing before passing to external tools that may not handle all URL formats.
 */
export function isGitReference(source: string): boolean {
   const sourceType = detectSourceType(source);

   if (sourceType === 'git-shorthand') {
      return true;
   }
   if (sourceType === 'https-repo') {
      return true;
   }
   // Check if it's a specific git host URL
   if (parseGitHubTreeUrl(source)) {
      return true;
   }
   if (parseGitHubBlobUrl(source)) {
      return true;
   }
   if (parseGitHubRepoUrl(source)) {
      return true;
   }
   if (isGenericGitUrl(source)) {
      return true;
   }
   return false;
}

// --- Internal resolution helpers ---

function resolveGitHubTree(
   ghTree: GitHubTreeUrl,
   refOverride: string | undefined,
   extensions: string[],
   _type: AssetType,
): ParsedReference {
   return {
      sourceType: 'https-repo',
      resolvedAs: 'git',
      value: {
         git: {
            url: buildGitHubUrl(ghTree.owner, ghTree.repo),
            ref: refOverride ?? ghTree.ref,
            path: ghTree.subdir,
         },
      },
      inferredName: inferNameFromPath(ghTree.subdir, extensions),
      gitDetails: {
         owner: ghTree.owner,
         repo: ghTree.repo,
         ref: refOverride ?? ghTree.ref,
         path: ghTree.subdir,
         provider: 'github',
      },
   };
}

function resolveGitHubBlob(
   ghBlob: GitHubBlobUrl,
   refOverride: string | undefined,
   extensions: string[],
): ParsedReference {
   return {
      sourceType: 'https-file',
      resolvedAs: 'git',
      value: {
         git: {
            url: buildGitHubUrl(ghBlob.owner, ghBlob.repo),
            ref: refOverride ?? ghBlob.ref,
            path: ghBlob.path,
         },
      },
      inferredName: inferNameFromPath(ghBlob.path, extensions),
      gitDetails: {
         owner: ghBlob.owner,
         repo: ghBlob.repo,
         ref: refOverride ?? ghBlob.ref,
         path: ghBlob.path,
         provider: 'github',
      },
   };
}

function resolveGitHubRepo(
   ghRepo: GitHubRepoUrl,
   refOverride: string | undefined,
   type: AssetType,
): ParsedReference {
   const gitRef: GitReference = {
      url: buildGitHubUrl(ghRepo.owner, ghRepo.repo),
   };

   if (refOverride) {
      gitRef.ref = refOverride;
   }

   const result: ParsedReference = {
      sourceType: 'https-repo',
      resolvedAs: 'git',
      value: { git: gitRef },
      inferredName: ghRepo.repo,
      normalizedRef: `github:${ghRepo.owner}/${ghRepo.repo}`,
      gitDetails: {
         owner: ghRepo.owner,
         repo: ghRepo.repo,
         ref: refOverride,
         provider: 'github',
      },
   };

   // For config type, also provide the shorthand
   if (type === 'config') {
      result.normalizedRef = `github:${ghRepo.owner}/${ghRepo.repo}`;
   }

   return result;
}

function resolveGitShorthand(
   shorthand: GitShorthand,
   refOverride: string | undefined,
   extensions: string[],
   _type: AssetType,
): ParsedReference {
   const gitUrl = buildProviderUrl(shorthand.provider, shorthand.user, shorthand.repo);
   const effectiveRef = refOverride ?? shorthand.ref;
   const gitRefObj: GitReference = { url: gitUrl };

   if (effectiveRef) {
      gitRefObj.ref = effectiveRef;
   }
   if (shorthand.subpath) {
      gitRefObj.path = shorthand.subpath;
   }

   return {
      sourceType: 'git-shorthand',
      resolvedAs: 'git',
      value: { git: gitRefObj },
      inferredName: shorthand.subpath
         ? inferNameFromPath(shorthand.subpath, extensions)
         : shorthand.repo,
      gitDetails: {
         owner: shorthand.user,
         repo: shorthand.repo,
         ref: effectiveRef,
         path: shorthand.subpath,
         provider: shorthand.provider,
      },
   };
}

function resolveGenericGitUrl(
   source: string,
   refOverride: string | undefined,
   extensions: string[],
): ParsedReference {
   if (refOverride) {
      return {
         sourceType: detectSourceType(source),
         resolvedAs: 'git',
         value: { git: { url: source, ref: refOverride } },
         inferredName: inferNameFromPath(source.replace(/\.git$/, ''), extensions),
      };
   }

   return {
      sourceType: detectSourceType(source),
      resolvedAs: 'git',
      value: source,
      inferredName: inferNameFromPath(source.replace(/\.git$/, ''), extensions),
   };
}
