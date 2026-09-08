import { describe, it, expect } from 'vitest';
import {
   marketplaceNameSchema,
   marketplaceObjectSchema,
   marketplacesSchema,
} from '../marketplaces.js';
import { aiJsonConfigSchema } from '../config.js';

describe('marketplacesSchema', () => {
   it('accepts valid marketplace names', () => {
      expect(marketplaceNameSchema.safeParse('claude-plugins-official').success).toBe(true);

      expect(marketplaceNameSchema.safeParse('my-team-marketplace').success).toBe(true);

      expect(marketplaceNameSchema.safeParse('Invalid Name').success).toBe(false);
   });

   it('validates marketplace object with source and enabled', () => {
      const parsed = marketplaceObjectSchema.parse({
         source: 'github:anthropics/claude-plugins-official',
         enabled: true,
         description: 'Official Anthropic Claude Code Plugins',
      });

      expect(parsed.source).toBe('github:anthropics/claude-plugins-official');

      expect(parsed.enabled).toBe(true);
   });

   it('validates a record of marketplaces with string URLs and objects', () => {
      const parsed = marketplacesSchema.parse({
         'claude-plugins-official': 'github:anthropics/claude-plugins-official',
         'internal-tools': {
            source: 'https://internal.example.com/marketplace.json',
            enabled: true,
         },
         'disabled-marketplace': false,
      });

      expect(parsed['claude-plugins-official']).toBe('github:anthropics/claude-plugins-official');

      expect(parsed['disabled-marketplace']).toBe(false);
   });

   it('integrates cleanly with aiJsonConfigSchema', () => {
      const config = aiJsonConfigSchema.parse({
         marketplaces: {
            'claude-plugins-official': 'github:anthropics/claude-plugins-official',
         },
      });

      expect(config.marketplaces?.['claude-plugins-official']).toBe('github:anthropics/claude-plugins-official');
   });
});
