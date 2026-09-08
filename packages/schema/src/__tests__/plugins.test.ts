import { describe, it, expect } from 'vitest';
import {
   pluginNameSchema,
   pluginObjectSchema,
   pluginsSchema,
} from '../plugins.js';
import { aiJsonConfigSchema } from '../config.js';

describe('pluginsSchema', () => {
   it('accepts valid plugin names and shorthand identifiers', () => {
      expect(pluginNameSchema.safeParse('code-review').success).toBe(true);

      expect(pluginNameSchema.safeParse('code-review@claude-plugins-official').success).toBe(true);

      expect(pluginNameSchema.safeParse('@acme/my-plugin').success).toBe(true);

      expect(pluginNameSchema.safeParse('Invalid Name with Spaces').success).toBe(false);
   });

   it('validates plugin object with marketplace and source', () => {
      const parsed = pluginObjectSchema.parse({
         marketplace: 'claude-plugins-official',
         enabled: true,
         options: { strict: true },
      });

      expect(parsed.marketplace).toBe('claude-plugins-official');

      expect(parsed.enabled).toBe(true);
   });

   it('validates a record of plugins with booleans, strings, and objects', () => {
      const parsed = pluginsSchema.parse({
         'code-review@claude-plugins-official': true,
         'disabled-plugin@marketplace': false,
         'local-plugin': './plugins/local',
         'custom-plugin': {
            marketplace: 'my-team',
            enabled: true,
         },
      });

      expect(parsed['code-review@claude-plugins-official']).toBe(true);

      expect(parsed['disabled-plugin@marketplace']).toBe(false);
   });

   it('integrates cleanly with aiJsonConfigSchema', () => {
      const config = aiJsonConfigSchema.parse({
         plugins: {
            'code-review@claude-plugins-official': true,
         },
      });

      expect(config.plugins?.['code-review@claude-plugins-official']).toBe(true);
   });
});
