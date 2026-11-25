import { describe, expect, it } from 'vitest';
import { validateReference } from '../reference-resolver.js';

describe('validateReference', () => {
   describe('GitHub tree URLs', () => {
      it('keeps the master ref so the shorthand does not fall back to main', () => {
         const result = validateReference('https://github.com/acme/ai-config/tree/master/configs/web');

         expect(result).toEqual({ sourceType: 'https-repo', normalized: 'github:acme/ai-config/configs/web#master' });
      });

      it('keeps the main ref', () => {
         const result = validateReference('https://github.com/acme/ai-config/tree/main/configs/web');

         expect(result.normalized).toBe('github:acme/ai-config/configs/web#main');
      });

      it('keeps any other branch or tag', () => {
         const result = validateReference('https://github.com/acme/ai-config/tree/v2.1.0/configs/web');

         expect(result.normalized).toBe('github:acme/ai-config/configs/web#v2.1.0');
      });
   });

   it('normalizes a GitHub repository URL to shorthand', () => {
      const result = validateReference('https://github.com/acme/ai-config');

      expect(result).toEqual({ sourceType: 'https-repo', normalized: 'github:acme/ai-config' });
   });

   it('rejects HTTP URLs and names the option they came from', () => {
      expect(() => {
         return validateReference('http://example.com/ai.json', '--extends');
      }).toThrow('--extends: HTTP URLs are not supported');
   });
});
