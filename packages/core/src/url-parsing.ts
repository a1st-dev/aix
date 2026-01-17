/**
 * Shared URL parsing utilities for Git host URLs and source references.
 * Used by CLI commands and core reference parsers.
 */

export interface GitHubRepoUrl {
   owner: string;
   repo: string;
}

export interface GitHubBlobUrl extends GitHubRepoUrl {
   ref: string;
   path: string;
}

export interface GitHubTreeUrl extends GitHubRepoUrl {
   ref: string;
   subdir: string;
}

export interface GitLabTreeUrl {
   group: string;
   project: string;
   ref: string;
   subdir: string;
}

export interface GitLabBlobUrl {
   group: string;
   project: string;
   ref: string;
   path: string;
}

export interface BitbucketBlobUrl {
   workspace: string;
   repo: string;
   ref: string;
   path: string;
}

export interface GitShorthand {
   provider: 'github' | 'gitlab' | 'bitbucket';
   user: string;
   repo: string;
   subpath?: string;
   ref?: string;
}

/**
 * Parse a GitHub web URL for a repo root (no blob/tree path):
 * `https://github.com/org/repo` or `https://github.com/org/repo/`
 */
export function parseGitHubRepoUrl(url: string): GitHubRepoUrl | undefined {
   const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);

   if (!match) {
      return undefined;
   }
   const [, owner, repo] = match;

   return { owner: owner!, repo: repo!.replace(/\.git$/, '') };
}

/**
 * Parse a GitHub web URL with `/blob/ref/path`:
 * `https://github.com/org/repo/blob/main/path/to/file.md`
 */
export function parseGitHubBlobUrl(url: string): GitHubBlobUrl | undefined {
   const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);

   if (!match) {
      return undefined;
   }
   const [, owner, repo, ref, path] = match;

   return { owner: owner!, repo: repo!, ref: ref!, path: path! };
}

/**
 * Parse a GitHub web URL with `/tree/ref/path`:
 * `https://github.com/org/repo/tree/main/path/to/dir`
 */
export function parseGitHubTreeUrl(url: string): GitHubTreeUrl | undefined {
   const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);

   if (!match) {
      return undefined;
   }
   const [, owner, repo, ref, subdir] = match;

   return { owner: owner!, repo: repo!, ref: ref!, subdir: subdir! };
}

/**
 * Parse a GitLab web URL with `/-/tree/ref/path`:
 * `https://gitlab.com/group/project/-/tree/branch/path`
 */
export function parseGitLabTreeUrl(url: string): GitLabTreeUrl | undefined {
   const match = url.match(/^https:\/\/gitlab\.com\/([^/]+)\/([^/]+)\/-\/tree\/([^/]+)\/(.+)$/);

   if (!match) {
      return undefined;
   }
   const [, group, project, ref, subdir] = match;

   return { group: group!, project: project!, ref: ref!, subdir: subdir! };
}

/**
 * Parse a GitLab web URL with `/-/blob/ref/path`:
 * `https://gitlab.com/group/project/-/blob/branch/path/to/file.json`
 */
export function parseGitLabBlobUrl(url: string): GitLabBlobUrl | undefined {
   const match = url.match(/^https:\/\/gitlab\.com\/([^/]+)\/([^/]+)\/-\/blob\/([^/]+)\/(.+)$/);

   if (!match) {
      return undefined;
   }
   const [, group, project, ref, path] = match;

   return { group: group!, project: project!, ref: ref!, path: path! };
}

/**
 * Parse a Bitbucket web URL with `/src/ref/path`:
 * `https://bitbucket.org/workspace/repo/src/branch/path/to/file.json`
 */
export function parseBitbucketBlobUrl(url: string): BitbucketBlobUrl | undefined {
   const match = url.match(/^https:\/\/bitbucket\.org\/([^/]+)\/([^/]+)\/src\/([^/]+)\/(.+)$/);

   if (!match) {
      return undefined;
   }
   const [, workspace, repo, ref, path] = match;

   return { workspace: workspace!, repo: repo!, ref: ref!, path: path! };
}

/**
 * Parse git shorthand format: `github:user/repo/path#ref`, `gitlab:user/repo/path#ref`, or `bitbucket:user/repo/path#ref`
 */
export function parseGitShorthand(input: string): GitShorthand | undefined {
   const match = input.match(/^(github|gitlab|bitbucket):([^#]+)(?:#(.+))?$/);

   if (!match) {
      return undefined;
   }

   const [, provider, repoPath, ref] = match,
         parts = repoPath!.split('/');

   if (parts.length < 2) {
      return undefined;
   }

   const user = parts[0]!,
         repo = parts[1]!,
         subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined;

   return {
      provider: provider as 'github' | 'gitlab' | 'bitbucket',
      user,
      repo,
      subpath,
      ref,
   };
}

/**
 * Check if a source string represents a local file path. Recognizes:
 * - Explicit relative paths: `./file`, `../file`
 * - Absolute paths: `/path/to/file`
 * - Implicit relative paths with file extensions: `prompts/file.md`, `file.txt`
 */
export function isLocalPath(source: string): boolean {
   // Explicit relative or absolute paths
   if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
      return true;
   }

   // Exclude URLs and git shorthand
   if (source.includes('://') || /^(github|gitlab|bitbucket):/.test(source)) {
      return false;
   }

   // Check for common file extensions that indicate a local file
   const fileExtensions = /\.(md|txt|json|ya?ml|prompt\.md)$/i;

   return fileExtensions.test(source);
}

/**
 * Check if a source string is a generic git URL (https, git@, git://).
 */
export function isGenericGitUrl(source: string): boolean {
   return source.startsWith('https://') || source.startsWith('git@') || source.startsWith('git://');
}

/**
 * Infer a name from a path by taking the last segment and optionally stripping extensions.
 * @param path - The path to extract a name from
 * @param extensions - Extensions to strip (e.g., ['.md', '.txt']). If not provided, no stripping.
 */
export function inferNameFromPath(path: string, extensions?: string[]): string | undefined {
   const segments = path.split('/').filter(Boolean),
         lastSegment = segments.pop();

   if (!lastSegment) {
      return undefined;
   }
   if (!extensions || extensions.length === 0) {
      return lastSegment;
   }

   // Build regex pattern for extensions (escape dots, join with |)
   const pattern = extensions.map((ext) => ext.replace(/\./g, '\\.')).join('|'),
         regex = new RegExp(`(${pattern})$`, 'i');

   return lastSegment.replace(regex, '');
}

/**
 * Build a GitHub URL from owner and repo.
 */
export function buildGitHubUrl(owner: string, repo: string): string {
   return `https://github.com/${owner}/${repo}`;
}

/**
 * Build a GitLab URL from group and project.
 */
export function buildGitLabUrl(group: string, project: string): string {
   return `https://gitlab.com/${group}/${project}`;
}

/**
 * Build a provider URL from shorthand components.
 */
export function buildProviderUrl(
   provider: 'github' | 'gitlab' | 'bitbucket',
   user: string,
   repo: string,
): string {
   if (provider === 'bitbucket') {
      return `https://bitbucket.org/${user}/${repo}`;
   }
   return `https://${provider}.com/${user}/${repo}`;
}

/**
 * Convert a GitHub blob URL to a raw content URL.
 * `https://github.com/org/repo/blob/main/path` → `https://raw.githubusercontent.com/org/repo/main/path`
 */
export function githubBlobToRaw(url: string): string | undefined {
   const parsed = parseGitHubBlobUrl(url);

   if (!parsed) {
      return undefined;
   }
   return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/${parsed.path}`;
}

/**
 * Convert a GitLab blob URL to a raw content URL.
 * `https://gitlab.com/group/project/-/blob/main/path` → `https://gitlab.com/group/project/-/raw/main/path`
 */
export function gitlabBlobToRaw(url: string): string | undefined {
   const parsed = parseGitLabBlobUrl(url);

   if (!parsed) {
      return undefined;
   }
   return `https://gitlab.com/${parsed.group}/${parsed.project}/-/raw/${parsed.ref}/${parsed.path}`;
}

/**
 * Convert a Bitbucket blob URL to a raw content URL.
 * `https://bitbucket.org/workspace/repo/src/branch/path` → `https://bitbucket.org/workspace/repo/raw/branch/path`
 */
export function bitbucketBlobToRaw(url: string): string | undefined {
   const parsed = parseBitbucketBlobUrl(url);

   if (!parsed) {
      return undefined;
   }
   return `https://bitbucket.org/${parsed.workspace}/${parsed.repo}/raw/${parsed.ref}/${parsed.path}`;
}

/**
 * Convert any supported git host blob URL to a raw URL. Returns the original URL if not a recognized blob URL.
 */
export function convertBlobToRawUrl(url: string): string {
   const githubRaw = githubBlobToRaw(url);

   if (githubRaw) {
      return githubRaw;
   }

   const gitlabRaw = gitlabBlobToRaw(url);

   if (gitlabRaw) {
      return gitlabRaw;
   }

   const bitbucketRaw = bitbucketBlobToRaw(url);

   if (bitbucketRaw) {
      return bitbucketRaw;
   }

   return url;
}
