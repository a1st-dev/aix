import { describe, it, expect } from 'vitest';
import { validateConfig, parseConfig } from '../validate.js';
import { aiJsonConfigSchema } from '../config.js';

describe('validateConfig', () => {
   it('validates a minimal valid config', () => {
      const config = {
         $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
   });

   it('validates a config with skills', () => {
      const config = {
         skills: {
            typescript: '^1.0.0',
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(result.data?.skills).toEqual({ typescript: '^1.0.0' });
   });

   it('validates a config with MCP servers (stdio)', () => {
      const config = {
         mcp: {
            github: {
               command: 'npx',
               args: ['@modelcontextprotocol/server-github'],
            },
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(result.data?.mcp?.github).toBeDefined();
   });

   it('validates a config with HTTP MCP server', () => {
      const config = {
         mcp: {
            api: {
               url: 'http://localhost:3000/mcp',
            },
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      const apiConfig = result.data?.mcp?.api;

      expect(apiConfig).toBeDefined();
      if (apiConfig && 'url' in apiConfig) {
         expect(apiConfig.url).toBe('http://localhost:3000/mcp');
      }
   });

   it('validates a config with rules as source references', () => {
      const config = {
         rules: {
            'style-rule': './rules/style.md',
            'remote-rule': 'https://github.com/user/repo/blob/main/rules.md',
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(Object.keys(result.data?.rules ?? {})).toHaveLength(2);
   });

   it('validates a config with inline rule objects', () => {
      const config = {
         rules: {
            'typescript-rule': { content: 'Use TypeScript strict mode' },
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(Object.keys(result.data?.rules ?? {})).toHaveLength(1);
   });

   it('validates editors array shorthand', () => {
      const config = {
         editors: ['windsurf', 'cursor'],
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
   });

   it('validates editors mixed array shorthand', () => {
      const config = {
         editors: ['windsurf', { cursor: { aiSettings: { model: 'gpt-4' } } }],
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
   });

   it('validates editors object form', () => {
      const config = {
         editors: {
            windsurf: { enabled: true },
            cursor: { enabled: false },
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(true);
   });

   it('returns errors for invalid config', () => {
      const config = {
         skills: {
            'INVALID-NAME': '^1.0.0', // Uppercase not allowed
         },
      };

      const result = validateConfig(config);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
   });
});

describe('parseConfig', () => {
   it('parses a valid config', () => {
      const config = {
         skills: { typescript: '^1.0.0' },
      };

      const parsed = parseConfig(config);

      expect(parsed.skills).toEqual({ typescript: '^1.0.0' });
   });

   it('throws for invalid config', () => {
      const config = {
         skills: {
            INVALID: '^1.0.0',
         },
      };

      expect(() => parseConfig(config)).toThrow();
   });
});

describe('aiJsonConfigSchema', () => {
   it('has expected shape', () => {
      expect(aiJsonConfigSchema.shape).toHaveProperty('skills');
      expect(aiJsonConfigSchema.shape).toHaveProperty('mcp');
      expect(aiJsonConfigSchema.shape).toHaveProperty('rules');
      expect(aiJsonConfigSchema.shape).toHaveProperty('editors');
   });
});
