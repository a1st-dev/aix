import { describe, it, expect } from 'vitest';
import {
   normalizeConfig,
   normalizeEditors,
   normalizeSourceRef,
   normalizeRulesConfig,
   normalizePromptsConfig,
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
