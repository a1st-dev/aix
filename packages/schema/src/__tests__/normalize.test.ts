import { describe, it, expect } from 'vitest';
import {
   normalizeConfig,
   normalizeEditors,
   normalizeSourceRef,
   normalizeRulesConfig,
   normalizePromptsConfig,
   detectSourceType,
   isLocalPath,
} from '../normalize.js';

describe('normalizeSourceRef', () => {
   it('normalizes local path with ./', () => {
      const result = normalizeSourceRef('./rules/style.md');

      expect(result).toEqual({ path: './rules/style.md' });
   });

   it('normalizes local path with ../', () => {
      const result = normalizeSourceRef('../shared/rules.md');

      expect(result).toEqual({ path: '../shared/rules.md' });
   });

   it('normalizes absolute path', () => {
      const result = normalizeSourceRef('/absolute/path/rules.md');

      expect(result).toEqual({ path: '/absolute/path/rules.md' });
   });

   it('normalizes file: protocol', () => {
      const result = normalizeSourceRef('file:../foo/bar.md');

      expect(result).toEqual({ path: '../foo/bar.md' });
   });

   it('normalizes implicit relative path with file extension', () => {
      const result = normalizeSourceRef('prompts/add-skill.md');

      expect(result).toEqual({ path: 'prompts/add-skill.md' });
   });

   it('normalizes implicit relative path for various extensions', () => {
      expect(normalizeSourceRef('rules.yaml')).toEqual({ path: 'rules.yaml' });
      expect(normalizeSourceRef('config.json')).toEqual({ path: 'config.json' });
      expect(normalizeSourceRef('notes.txt')).toEqual({ path: 'notes.txt' });
   });

   it('normalizes https URL as git source', () => {
      const result = normalizeSourceRef('https://github.com/user/repo/blob/main/rules.md');

      expect(result).toEqual({ git: { url: 'https://github.com/user/repo/blob/main/rules.md' } });
   });

   it('normalizes http URL as git source', () => {
      const result = normalizeSourceRef('http://gitlab.company.com/team/rules.md');

      expect(result).toEqual({ git: { url: 'http://gitlab.company.com/team/rules.md' } });
   });

   it('normalizes git+https URL as git source', () => {
      const result = normalizeSourceRef('git+https://github.com/user/repo.git#main');

      expect(result).toEqual({ git: { url: 'git+https://github.com/user/repo.git#main' } });
   });

   it('normalizes github: shorthand as git source', () => {
      const result = normalizeSourceRef('github:user/repo#v1.0');

      expect(result).toEqual({ git: { url: 'github:user/repo#v1.0' } });
   });

   it('normalizes gitlab: shorthand as git source', () => {
      const result = normalizeSourceRef('gitlab:company/rules');

      expect(result).toEqual({ git: { url: 'gitlab:company/rules' } });
   });

   it('normalizes user/repo shorthand as git source', () => {
      const result = normalizeSourceRef('user/repo#feature-branch');

      expect(result).toEqual({ git: { url: 'user/repo#feature-branch' } });
   });

   it('passes through object rules unchanged', () => {
      const rule = { content: 'Use TypeScript strict mode' };
      const result = normalizeSourceRef(rule);

      expect(result).toEqual(rule);
   });

   it('passes through complex object rules unchanged', () => {
      const rule = {
         description: 'React best practices',
         activation: 'auto',
         path: './rules/react.md',
      };
      const result = normalizeSourceRef(rule);

      expect(result).toEqual(rule);
   });
});

describe('normalizeRulesConfig', () => {
   it('normalizes an object of mixed rules', () => {
      const rules = {
         'local-rule': './local/rule.md',
         'remote-rule': 'https://github.com/user/repo/rules.md',
         'inline-rule': { content: 'Inline rule' },
      };

      const result = normalizeRulesConfig(rules);

      expect(result).toEqual({
         'local-rule': { path: './local/rule.md' },
         'remote-rule': { git: { url: 'https://github.com/user/repo/rules.md' } },
         'inline-rule': { content: 'Inline rule' },
      });
   });
});

describe('normalizePromptsConfig', () => {
   it('normalizes an object of mixed prompts', () => {
      const prompts = {
         'local-prompt': './prompts/review.md',
         'remote-prompt': 'https://github.com/user/repo/prompt.md',
         'inline-prompt': { content: 'Review this code' },
      };

      const result = normalizePromptsConfig(prompts);

      expect(result).toEqual({
         'local-prompt': { path: './prompts/review.md' },
         'remote-prompt': { git: { url: 'https://github.com/user/repo/prompt.md' } },
         'inline-prompt': { content: 'Review this code' },
      });
   });
});

describe('normalizeEditors', () => {
   it('normalizes string array to object form', () => {
      const result = normalizeEditors(['windsurf', 'cursor']);

      expect(result).toEqual({
         windsurf: { enabled: true },
         cursor: { enabled: true },
      });
   });

   it('normalizes mixed array with object entries', () => {
      const result = normalizeEditors(['windsurf', { cursor: { aiSettings: { model: 'gpt-4' } } }]);

      expect(result).toEqual({
         windsurf: { enabled: true },
         cursor: { enabled: true, aiSettings: { model: 'gpt-4' } },
      });
   });

   it('passes through object form unchanged', () => {
      const editors = {
         windsurf: { enabled: true },
         cursor: { enabled: false },
      };

      const result = normalizeEditors(editors);

      expect(result).toEqual(editors);
   });
});

describe('normalizeConfig', () => {
   it('normalizes editors array shorthand', () => {
      const config = {
         editors: ['windsurf'],
      };

      const result = normalizeConfig(config);

      expect(result.editors).toEqual({
         windsurf: { enabled: true },
      });
   });

   it('normalizes rules with string references', () => {
      const config = {
         rules: {
            'style-rule': './rules/style.md',
            'remote-rule': 'https://github.com/user/repo/rules.md',
         },
      };

      const result = normalizeConfig(config);

      expect(result.rules).toEqual({
         'style-rule': { path: './rules/style.md' },
         'remote-rule': { git: { url: 'https://github.com/user/repo/rules.md' } },
      });
   });

   it('normalizes rules with mixed formats', () => {
      const config = {
         rules: {
            'local-rule': './local/rules.md',
            'remote-rule': 'https://github.com/user/repo/rules.md',
            'inline-rule': { content: 'Inline rule' },
         },
      };

      const result = normalizeConfig(config);

      expect(result.rules).toEqual({
         'local-rule': { path: './local/rules.md' },
         'remote-rule': { git: { url: 'https://github.com/user/repo/rules.md' } },
         'inline-rule': { content: 'Inline rule' },
      });
   });

   it('handles full config with both editors and rules', () => {
      const config = {
         $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
         skills: { typescript: '^1.0.0' },
         editors: ['windsurf'],
         rules: {
            'typescript-rule': { content: 'Use TypeScript strict mode' },
            'style-rule': './rules/style.md',
         },
      };

      const result = normalizeConfig(config);

      expect(result.$schema).toBe('https://x.a1st.dev/schemas/v1/ai.json');
      expect(result.skills).toEqual({ typescript: '^1.0.0' });
      expect(result.editors).toEqual({ windsurf: { enabled: true } });
      expect(result.rules).toEqual({
         'typescript-rule': { content: 'Use TypeScript strict mode' },
         'style-rule': { path: './rules/style.md' },
      });
   });

   it('handles null/undefined gracefully', () => {
      expect(normalizeConfig(null)).toBe(null);
      expect(normalizeConfig(undefined)).toBe(undefined);
   });

   it('handles config without editors or rules', () => {
      const config = {
         skills: { typescript: '^1.0.0' },
      };

      const result = normalizeConfig(config);

      expect(result).toEqual(config);
   });

   it('passes through MCP config unchanged (shorthand format)', () => {
      const config = {
         mcp: {
            playwright: {
               command: 'npx',
               args: ['-y', '@playwright/mcp@latest'],
            },
            'remote-server': {
               url: 'https://example.com/mcp',
               headers: { Authorization: 'Bearer ${MCP_TOKEN}' },
            },
         },
      };

      const result = normalizeConfig(config);

      // MCP config is passed through unchanged (no normalization needed)
      expect(result.mcp).toEqual(config.mcp);
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

   it('recognizes file: protocol paths', () => {
      expect(isLocalPath('file:../foo/bar.md')).toBe(true);
      expect(isLocalPath('file:./local.json')).toBe(true);
   });

   it('recognizes implicit relative paths with file extensions', () => {
      expect(isLocalPath('prompts/add-skill.md')).toBe(true);
      expect(isLocalPath('file.txt')).toBe(true);
      expect(isLocalPath('path/to/config.json')).toBe(true);
      expect(isLocalPath('rules.yaml')).toBe(true);
      expect(isLocalPath('rules.yml')).toBe(true);
   });

   it('rejects URLs', () => {
      expect(isLocalPath('https://example.com/file.md')).toBe(false);
      expect(isLocalPath('http://example.com/file.md')).toBe(false);
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
