import { describe, it, expect } from 'vitest';
import {
   parseGitHubBlobUrl,
   parseGitLabBlobUrl,
   parseBitbucketBlobUrl,
   parseGitShorthand,
   convertBlobToRawUrl,
   buildProviderUrl,
   isLocalPath,
   detectSourceType,
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

describe('isLocalPath', () => {
   it('recognizes explicit relative paths with ./', () => {
      expect(isLocalPath('./file.md')).toBe(true);
      expect(isLocalPath('./prompts/review.md')).toBe(true);
   });

   it('recognizes parent directory paths with ../', () => {
      expect(isLocalPath('../file.md')).toBe(true);
      expect(isLocalPath('../../prompts/review.md')).toBe(true);
   });

   it('recognizes absolute paths', () => {
      expect(isLocalPath('/path/to/file.md')).toBe(true);
      expect(isLocalPath('/Users/me/prompts/review.md')).toBe(true);
   });

   it('recognizes implicit relative paths with file extensions', () => {
      expect(isLocalPath('prompts/add-skill.md')).toBe(true);
      expect(isLocalPath('file.txt')).toBe(true);
      expect(isLocalPath('path/to/config.json')).toBe(true);
      expect(isLocalPath('rules.yaml')).toBe(true);
      expect(isLocalPath('rules.yml')).toBe(true);
      expect(isLocalPath('custom.prompt.md')).toBe(true);
   });

   it('rejects URLs', () => {
      expect(isLocalPath('https://example.com/file.md')).toBe(false);
      expect(isLocalPath('http://example.com/file.md')).toBe(false);
      expect(isLocalPath('git://github.com/org/repo')).toBe(false);
   });

   it('rejects git shorthand', () => {
      expect(isLocalPath('github:org/repo/file.md')).toBe(false);
      expect(isLocalPath('gitlab:group/project/file.md')).toBe(false);
      expect(isLocalPath('bitbucket:workspace/repo/file.md')).toBe(false);
   });

   it('rejects plain text without file extensions', () => {
      expect(isLocalPath('some inline content')).toBe(false);
      expect(isLocalPath('Review code for issues')).toBe(false);
   });

   it('recognizes file: protocol paths', () => {
      expect(isLocalPath('file:../foo/bar.md')).toBe(true);
      expect(isLocalPath('file:./local.json')).toBe(true);
   });
});

describe('detectSourceType', () => {
   describe('git-shorthand', () => {
      it('detects github shorthand', () => {
         expect(detectSourceType('github:org/repo')).toBe('git-shorthand');
         expect(detectSourceType('github:org/repo/path#ref')).toBe('git-shorthand');
      });

      it('detects gitlab shorthand', () => {
         expect(detectSourceType('gitlab:group/project')).toBe('git-shorthand');
      });

      it('detects bitbucket shorthand', () => {
         expect(detectSourceType('bitbucket:workspace/repo')).toBe('git-shorthand');
      });
   });

   describe('https-file', () => {
      it('detects GitHub blob URLs', () => {
         expect(detectSourceType('https://github.com/org/repo/blob/main/ai.json')).toBe('https-file');
      });

      it('detects GitLab blob URLs', () => {
         expect(detectSourceType('https://gitlab.com/group/project/-/blob/main/ai.json')).toBe(
            'https-file',
         );
      });

      it('detects Bitbucket src URLs', () => {
         expect(detectSourceType('https://bitbucket.org/workspace/repo/src/main/ai.json')).toBe(
            'https-file',
         );
      });

      it('detects direct .json URLs', () => {
         expect(detectSourceType('https://example.com/config/ai.json')).toBe('https-file');
      });
   });

   describe('https-repo', () => {
      it('detects GitHub repo URLs', () => {
         expect(detectSourceType('https://github.com/org/repo')).toBe('https-repo');
      });

      it('detects generic HTTPS URLs without .json', () => {
         expect(detectSourceType('https://example.com/some/path')).toBe('https-repo');
      });
   });

   describe('http-unsupported', () => {
      it('detects HTTP URLs as unsupported', () => {
         expect(detectSourceType('http://example.com/ai.json')).toBe('http-unsupported');
         expect(detectSourceType('http://github.com/org/repo')).toBe('http-unsupported');
      });
   });

   describe('local', () => {
      it('detects explicit relative paths', () => {
         expect(detectSourceType('./ai.json')).toBe('local');
         expect(detectSourceType('../config/ai.json')).toBe('local');
      });

      it('detects absolute paths', () => {
         expect(detectSourceType('/path/to/ai.json')).toBe('local');
      });

      it('detects file: protocol', () => {
         expect(detectSourceType('file:../foo/bar.md')).toBe('local');
      });

      it('detects implicit relative paths with extensions', () => {
         expect(detectSourceType('prompts/review.md')).toBe('local');
         expect(detectSourceType('rules.yaml')).toBe('local');
      });
   });

   describe('npm', () => {
      it('detects npm package names', () => {
         expect(detectSourceType('@scope/package')).toBe('npm');
         expect(detectSourceType('aix-skill-typescript')).toBe('npm');
         expect(detectSourceType('some-package')).toBe('npm');
      });
   });
});
