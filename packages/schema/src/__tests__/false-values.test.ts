import { describe, it, expect } from 'vitest';
import { validateConfig } from '../validate.js';

describe('false values in schemas', () => {
   describe('mcp schema', () => {
      it('accepts false to disable an MCP server', () => {
         const config = {
            mcp: {
               playwright: false,
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.mcp?.playwright).toBe(false);
      });

      it('accepts mixed object and false values', () => {
         const config = {
            mcp: {
               playwright: false,
               github: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-github'],
               },
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.mcp?.playwright).toBe(false);
         expect(result.data?.mcp?.github).toBeDefined();
      });

      it('rejects true (only false is valid for disabling)', () => {
         const config = {
            mcp: {
               playwright: true,
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(false);
      });
   });

   describe('rules schema', () => {
      it('accepts false to disable a rule', () => {
         const config = {
            rules: {
               'my-rule': false,
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.rules?.['my-rule']).toBe(false);
      });

      it('accepts mixed object, string, and false values', () => {
         const config = {
            rules: {
               'disabled-rule': false,
               'inline-rule': { content: 'Some rule content' },
               'path-rule': './rules/style.md',
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.rules?.['disabled-rule']).toBe(false);
         expect(result.data?.rules?.['inline-rule']).toEqual({ content: 'Some rule content' });
         expect(result.data?.rules?.['path-rule']).toBe('./rules/style.md');
      });
   });

   describe('skills schema', () => {
      it('accepts false to disable a skill', () => {
         const config = {
            skills: {
               'pdf-processing': false,
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.skills?.['pdf-processing']).toBe(false);
      });

      it('accepts mixed string and false values', () => {
         const config = {
            skills: {
               'disabled-skill': false,
               'enabled-skill': 'github:user/repo',
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.skills?.['disabled-skill']).toBe(false);
         expect(result.data?.skills?.['enabled-skill']).toBe('github:user/repo');
      });
   });

   describe('prompts schema', () => {
      it('accepts false to disable a prompt', () => {
         const config = {
            prompts: {
               'code-review': false,
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.prompts?.['code-review']).toBe(false);
      });

      it('accepts mixed object, string, and false values', () => {
         const config = {
            prompts: {
               'disabled-prompt': false,
               'inline-prompt': { content: 'Review this code' },
               'path-prompt': './prompts/review.md',
            },
         };

         const result = validateConfig(config);

         expect(result.success).toBe(true);
         expect(result.data?.prompts?.['disabled-prompt']).toBe(false);
         expect(result.data?.prompts?.['inline-prompt']).toEqual({ content: 'Review this code' });
         expect(result.data?.prompts?.['path-prompt']).toBe('./prompts/review.md');
      });
   });
});
