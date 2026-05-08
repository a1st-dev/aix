import { basename, dirname, isAbsolute, normalize } from 'pathe';
import {
   buildGitHubUrl,
   buildGitLabUrl,
   convertBlobToRawUrl,
   extractFrontmatter,
   inferNameFromPath,
   parseAllFrontmatter,
   parseGitHubBlobUrl,
   parseGitHubRepoUrl,
   parseGitHubTreeUrl,
   parseGitLabBlobUrl,
   parseGitLabTreeUrl,
   parseSkillRef,
} from '@a1st/aix-core';
import type { AiJsonConfig } from '@a1st/aix-schema';

type SkillValue = AiJsonConfig['skills'][string];

export interface ParsedSkillSource {
   inferredName?: string;
   value: SkillValue;
}

export function normalizeSkillName(name: string): string {
   return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
}

export function isValidSkillName(name: string): boolean {
   return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

function trimTrailingSlash(value: string): string {
   return value.replace(/\/+$/, '');
}

function hasExplicitRelativePrefix(path: string): boolean {
   return path.startsWith('./') || path.startsWith('.\\');
}

function preserveExplicitRelativePrefix(source: string, path: string): string {
   if (
      !hasExplicitRelativePrefix(source) ||
      path === '' ||
      path.startsWith('../') ||
      isAbsolute(path)
   ) {
      return path;
   }

   return `./${path}`;
}

function toSkillDirectoryPath(path: string): string {
   const normalizedPath = normalize(path);

   if (basename(normalizedPath).toLowerCase() === 'skill.md') {
      const parent = dirname(normalizedPath);

      return preserveExplicitRelativePrefix(path, parent === '.' ? '' : parent);
   }

   return preserveExplicitRelativePrefix(path, trimTrailingSlash(normalizedPath));
}

function inferSkillName(source: string): string | undefined {
   const normalizedSource = normalize(source);

   if (basename(normalizedSource).toLowerCase() === 'skill.md') {
      const parent = dirname(normalizedSource);

      return parent === '.' ? undefined : inferNameFromPath(parent);
   }

   return inferNameFromPath(normalizedSource, ['.md']);
}

async function fetchRemoteSkillName(url: string): Promise<string | undefined> {
   try {
      const response = await fetch(convertBlobToRawUrl(url));

      if (!response.ok) {
         return undefined;
      }

      const content = await response.text();

      if (!content.trim()) {
         return undefined;
      }

      const { frontmatter } = extractFrontmatter(content);

      if (!frontmatter) {
         return undefined;
      }

      const parsed = parseAllFrontmatter(frontmatter),
            name = parsed.name;

      return typeof name === 'string' ? name : undefined;
   } catch {
      return undefined;
   }
}

function parseBareGitHubSource(
   source: string,
   refOverride?: string,
): { value: SkillValue; inferredName?: string } | undefined {
   if (
      source.startsWith('@') ||
      source.startsWith('.') ||
      source.startsWith('/') ||
      source.includes('\\') ||
      source.startsWith('http://') ||
      source.startsWith('https://') ||
      source.startsWith('git@') ||
      source.startsWith('git://')
   ) {
      return undefined;
   }

   const match = source.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:\/(.+))?$/);

   if (!match) {
      return undefined;
   }

   const [, owner, repo, subpath] = match,
         normalizedPath = subpath
            ? toSkillDirectoryPath(
               subpath.includes(':') && !subpath.startsWith('skills/')
                  ? `skills/${normalizeSkillName(subpath)}`
                  : subpath,
            )
            : undefined;

   return {
      value: {
         git: buildGitHubUrl(owner!, repo!),
         ...(refOverride && { ref: refOverride }),
         ...(normalizedPath && normalizedPath !== '.' && { path: normalizedPath }),
      },
      inferredName: inferSkillName(normalizedPath ?? repo!),
   };
}

function convertParsedSkillRefToValue(source: string, refOverride?: string): ParsedSkillSource {
   const parsed = parseSkillRef('__aix_add_skill__', source);

   switch (parsed.type) {
   case 'local':
      return {
         value: { path: toSkillDirectoryPath(parsed.path) },
         inferredName: inferSkillName(parsed.path),
      };
   case 'git':
      return {
         value: {
            git: parsed.url,
            ...(refOverride ?? parsed.ref ? { ref: refOverride ?? parsed.ref } : {}),
            ...(parsed.path ? { path: toSkillDirectoryPath(parsed.path) } : {}),
         },
         inferredName: inferSkillName(parsed.path ?? parsed.url),
      };
   case 'npm': {
      const packageName =
         !source.includes('/') && !source.includes(':') && !source.startsWith('aix-skill-')
            ? `aix-skill-${source}`
            : parsed.packageName;

      return {
         value: packageName,
         inferredName: inferSkillName(packageName.replace(/^@[^/]+\//, '').replace(/^aix-skill-/, '')),
      };
   }
   }
}

export async function parseSkillSource(source: string, refOverride?: string): Promise<ParsedSkillSource> {
   if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
      return {
         value: { path: toSkillDirectoryPath(source) },
         inferredName: inferSkillName(source),
      };
   }

   const githubTree = parseGitHubTreeUrl(source);

   if (githubTree) {
      return {
         value: {
            git: buildGitHubUrl(githubTree.owner, githubTree.repo),
            ref: refOverride ?? githubTree.ref,
            path: toSkillDirectoryPath(githubTree.subdir),
         },
         inferredName:
            normalizeSkillName(
               (await fetchRemoteSkillName(`${trimTrailingSlash(source)}/SKILL.md`)) ??
                  inferSkillName(githubTree.subdir) ??
                  githubTree.repo,
            ) || undefined,
      };
   }

   const githubBlob = parseGitHubBlobUrl(source);

   if (githubBlob) {
      const skillPath = toSkillDirectoryPath(githubBlob.path);

      return {
         value: {
            git: buildGitHubUrl(githubBlob.owner, githubBlob.repo),
            ref: refOverride ?? githubBlob.ref,
            ...(skillPath && skillPath !== '.' ? { path: skillPath } : {}),
         },
         inferredName:
            normalizeSkillName(
               (await fetchRemoteSkillName(source)) ??
                  inferSkillName(githubBlob.path) ??
                  githubBlob.repo,
            ) || undefined,
      };
   }

   const githubRepo = parseGitHubRepoUrl(source);

   if (githubRepo) {
      return {
         value: {
            git: buildGitHubUrl(githubRepo.owner, githubRepo.repo),
            ...(refOverride ? { ref: refOverride } : {}),
         },
         inferredName:
            normalizeSkillName(
               (await fetchRemoteSkillName(
                  `${trimTrailingSlash(source)}/blob/${refOverride ?? 'main'}/SKILL.md`,
               )) ?? githubRepo.repo,
            ) || undefined,
      };
   }

   const gitlabTree = parseGitLabTreeUrl(source);

   if (gitlabTree) {
      return {
         value: {
            git: buildGitLabUrl(gitlabTree.group, gitlabTree.project),
            ref: refOverride ?? gitlabTree.ref,
            path: toSkillDirectoryPath(gitlabTree.subdir),
         },
         inferredName:
            normalizeSkillName(
               (await fetchRemoteSkillName(`${trimTrailingSlash(source)}/SKILL.md`)) ??
                  inferSkillName(gitlabTree.subdir) ??
                  gitlabTree.project,
            ) || undefined,
      };
   }

   const gitlabBlob = parseGitLabBlobUrl(source);

   if (gitlabBlob) {
      const skillPath = toSkillDirectoryPath(gitlabBlob.path);

      return {
         value: {
            git: buildGitLabUrl(gitlabBlob.group, gitlabBlob.project),
            ref: refOverride ?? gitlabBlob.ref,
            ...(skillPath && skillPath !== '.' ? { path: skillPath } : {}),
         },
         inferredName:
            normalizeSkillName(
               (await fetchRemoteSkillName(source)) ??
                  inferSkillName(gitlabBlob.path) ??
                  gitlabBlob.project,
            ) || undefined,
      };
   }

   const bareGitHubSource = parseBareGitHubSource(source, refOverride);

   if (bareGitHubSource) {
      return {
         value: bareGitHubSource.value,
         inferredName: bareGitHubSource.inferredName
            ? normalizeSkillName(bareGitHubSource.inferredName) || undefined
            : undefined,
      };
   }

   const parsed = convertParsedSkillRefToValue(source, refOverride);

   return {
      value: parsed.value,
      inferredName: parsed.inferredName
         ? normalizeSkillName(parsed.inferredName) || undefined
         : undefined,
   };
}
