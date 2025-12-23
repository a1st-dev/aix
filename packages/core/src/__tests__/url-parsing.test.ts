import { describe, it, expect } from 'vitest';
import {
   parseGitHubBlobUrl,
   parseGitLabBlobUrl,
   parseBitbucketBlobUrl,
   parseGitShorthand,
   githubBlobToRaw,
   gitlabBlobToRaw,
   bitbucketBlobToRaw,
   convertBlobToRawUrl,
   buildProviderUrl,
} from '../url-parsing.js';

describe('parseGitHubBlobUrl', () => {
   it('parses GitHub blob URLs', () => {
      const result = parseGitHubBlobUrl('https://github.com/org/repo/blob/main/path/to/file.json');

      expect(result).toEqual({
         owner: 'org',
         repo: 'repo',
         ref: 'main',
         path: 'path/to/file.json',
      });
   });

   it('parses blob URLs with branch names containing slashes', () => {
      const result = parseGitHubBlobUrl('https://github.com/org/repo/blob/feature/branch/file.json');

      expect(result).toEqual({
         owner: 'org',
         repo: 'repo',
         ref: 'feature',
         path: 'branch/file.json',
      });
   });

   it('returns undefined for non-blob URLs', () => {
      expect(parseGitHubBlobUrl('https://github.com/org/repo')).toBeUndefined();
      expect(parseGitHubBlobUrl('https://github.com/org/repo/tree/main/path')).toBeUndefined();
   });
});

describe('parseGitLabBlobUrl', () => {
   it('parses GitLab blob URLs', () => {
      const result = parseGitLabBlobUrl(
         'https://gitlab.com/group/project/-/blob/main/path/to/file.json',
      );

      expect(result).toEqual({
         group: 'group',
         project: 'project',
         ref: 'main',
         path: 'path/to/file.json',
      });
   });

   it('returns undefined for non-blob URLs', () => {
      expect(parseGitLabBlobUrl('https://gitlab.com/group/project')).toBeUndefined();
      expect(parseGitLabBlobUrl('https://gitlab.com/group/project/-/tree/main/path')).toBeUndefined();
   });
});

describe('parseBitbucketBlobUrl', () => {
   it('parses Bitbucket src URLs', () => {
      const result = parseBitbucketBlobUrl(
         'https://bitbucket.org/workspace/repo/src/main/path/to/file.json',
      );

      expect(result).toEqual({
         workspace: 'workspace',
         repo: 'repo',
         ref: 'main',
         path: 'path/to/file.json',
      });
   });

   it('returns undefined for non-src URLs', () => {
      expect(parseBitbucketBlobUrl('https://bitbucket.org/workspace/repo')).toBeUndefined();
   });
});

describe('parseGitShorthand', () => {
   it('parses github shorthand', () => {
      expect(parseGitShorthand('github:org/repo')).toEqual({
         provider: 'github',
         user: 'org',
         repo: 'repo',
         subpath: undefined,
         ref: undefined,
      });
   });

   it('parses gitlab shorthand', () => {
      expect(parseGitShorthand('gitlab:group/project')).toEqual({
         provider: 'gitlab',
         user: 'group',
         repo: 'project',
         subpath: undefined,
         ref: undefined,
      });
   });

   it('parses bitbucket shorthand', () => {
      expect(parseGitShorthand('bitbucket:workspace/repo')).toEqual({
         provider: 'bitbucket',
         user: 'workspace',
         repo: 'repo',
         subpath: undefined,
         ref: undefined,
      });
   });

   it('parses shorthand with subpath', () => {
      expect(parseGitShorthand('github:org/repo/path/to/dir')).toEqual({
         provider: 'github',
         user: 'org',
         repo: 'repo',
         subpath: 'path/to/dir',
         ref: undefined,
      });
   });

   it('parses shorthand with ref', () => {
      expect(parseGitShorthand('github:org/repo#v1.0.0')).toEqual({
         provider: 'github',
         user: 'org',
         repo: 'repo',
         subpath: undefined,
         ref: 'v1.0.0',
      });
   });

   it('parses shorthand with subpath and ref', () => {
      expect(parseGitShorthand('github:org/repo/path/to/file.json#main')).toEqual({
         provider: 'github',
         user: 'org',
         repo: 'repo',
         subpath: 'path/to/file.json',
         ref: 'main',
      });
   });

   it('returns undefined for invalid shorthand', () => {
      expect(parseGitShorthand('invalid')).toBeUndefined();
      expect(parseGitShorthand('github:org')).toBeUndefined();
   });
});

describe('githubBlobToRaw', () => {
   it('converts blob URL to raw URL', () => {
      const result = githubBlobToRaw('https://github.com/org/repo/blob/main/path/to/file.json');

      expect(result).toBe('https://raw.githubusercontent.com/org/repo/main/path/to/file.json');
   });

   it('returns undefined for non-blob URLs', () => {
      expect(githubBlobToRaw('https://github.com/org/repo')).toBeUndefined();
   });
});

describe('gitlabBlobToRaw', () => {
   it('converts blob URL to raw URL', () => {
      const result = gitlabBlobToRaw('https://gitlab.com/group/project/-/blob/main/path/to/file.json');

      expect(result).toBe('https://gitlab.com/group/project/-/raw/main/path/to/file.json');
   });

   it('returns undefined for non-blob URLs', () => {
      expect(gitlabBlobToRaw('https://gitlab.com/group/project')).toBeUndefined();
   });
});

describe('bitbucketBlobToRaw', () => {
   it('converts src URL to raw URL', () => {
      const result = bitbucketBlobToRaw(
         'https://bitbucket.org/workspace/repo/src/main/path/to/file.json',
      );

      expect(result).toBe('https://bitbucket.org/workspace/repo/raw/main/path/to/file.json');
   });

   it('returns undefined for non-src URLs', () => {
      expect(bitbucketBlobToRaw('https://bitbucket.org/workspace/repo')).toBeUndefined();
   });
});

describe('convertBlobToRawUrl', () => {
   it('converts GitHub blob URLs', () => {
      const result = convertBlobToRawUrl('https://github.com/org/repo/blob/main/ai.json');

      expect(result).toBe('https://raw.githubusercontent.com/org/repo/main/ai.json');
   });

   it('converts GitLab blob URLs', () => {
      const result = convertBlobToRawUrl('https://gitlab.com/group/project/-/blob/main/ai.json');

      expect(result).toBe('https://gitlab.com/group/project/-/raw/main/ai.json');
   });

   it('converts Bitbucket src URLs', () => {
      const result = convertBlobToRawUrl('https://bitbucket.org/workspace/repo/src/main/ai.json');

      expect(result).toBe('https://bitbucket.org/workspace/repo/raw/main/ai.json');
   });

   it('returns original URL if not a blob URL', () => {
      const url = 'https://example.com/ai.json';

      expect(convertBlobToRawUrl(url)).toBe(url);
   });
});

describe('buildProviderUrl', () => {
   it('builds GitHub URL', () => {
      expect(buildProviderUrl('github', 'org', 'repo')).toBe('https://github.com/org/repo');
   });

   it('builds GitLab URL', () => {
      expect(buildProviderUrl('gitlab', 'group', 'project')).toBe('https://gitlab.com/group/project');
   });

   it('builds Bitbucket URL', () => {
      expect(buildProviderUrl('bitbucket', 'workspace', 'repo')).toBe(
         'https://bitbucket.org/workspace/repo',
      );
   });
});
