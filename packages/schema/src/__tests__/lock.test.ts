import { describe, expect, it } from 'vitest';
import { aiLockFileSchema } from '../lock.js';

describe('aiLockFileSchema', () => {
   it('accepts a valid v1 lockfile', () => {
      const result = aiLockFileSchema.safeParse({
         lockfileVersion: 1,
         generatedBy: 'aix',
         config: {
            path: 'ai.json',
            digest: `sha256:${'a'.repeat(64)}`,
            integrity: 'sha512-YWJjZA==',
            size: 4,
         },
         entities: {
            skills: {},
            rules: {},
            prompts: {},
            mcp: {},
            hooks: {},
            editors: {},
            aix: {},
         },
      });

      expect(result.success).toBe(true);
   });

   it('rejects malformed digests', () => {
      const result = aiLockFileSchema.safeParse({
         lockfileVersion: 1,
         generatedBy: 'aix',
         config: {
            path: 'ai.json',
            digest: 'sha256:not-a-digest',
            integrity: 'sha512-YWJjZA==',
            size: 4,
         },
         entities: {
            skills: {},
            rules: {},
            prompts: {},
            mcp: {},
            hooks: {},
            editors: {},
            aix: {},
         },
      });

      expect(result.success).toBe(false);
   });
});
