import { describe, expect, it } from 'vitest';
import {
   applyJsoncDiff,
   mergeJsonc,
   modifyJsonc,
   parseJsonc,
   removeJsoncProperty,
} from '../jsonc.js';

describe('parseJsonc', () => {
   it('parses standard JSON', () => {
      const json = '{"name": "test", "value": 42}',
            result = parseJsonc<{ name: string; value: number }>(json);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual({ name: 'test', value: 42 });
   });

   it('parses JSON with line and block comments', () => {
      const jsonc = `
         // Configuration file
         {
            /* MCP server definition */
            "name": "sqlite",
            "active": true // inline comment
         }
      `,
            result = parseJsonc<{ name: string; active: boolean }>(jsonc);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual({ name: 'sqlite', active: true });
   });

   it('parses JSON with trailing commas', () => {
      const jsonc = '{"items": [1, 2, 3,], "key": "val",}',
            result = parseJsonc<{ items: number[]; key: string }>(jsonc);

      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual({ items: [ 1, 2, 3 ], key: 'val' });
   });

   it('returns errors for invalid JSON syntax', () => {
      const invalid = '{ "name": unquoted_value }',
            result = parseJsonc(invalid);

      expect(result.data).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
   });
});

describe('modifyJsonc', () => {
   it('modifies an existing property while preserving comments', () => {
      const jsonc = [
         '// Top level comment',
         '{',
         '   // Description of theme',
         '   "theme": "dark",',
         '   // Settings',
         '   "fontSize": 14',
         '}',
         '',
      ].join('\n');

      const updated = modifyJsonc(jsonc, [ 'fontSize' ], 16);

      expect(updated).toContain('// Top level comment');
      expect(updated).toContain('// Description of theme');
      expect(updated).toContain('"fontSize": 16');
      expect(updated).toContain('"theme": "dark"');
   });

   it('adds a new property while preserving existing comments', () => {
      const jsonc = [
         '{',
         '   // Keep this comment',
         '   "theme": "dark"',
         '}',
         '',
      ].join('\n');

      const updated = modifyJsonc(jsonc, [ 'fontSize' ], 16);

      expect(updated).toContain('// Keep this comment');
      expect(updated).toContain('"fontSize": 16');
      expect(updated).toContain('"theme": "dark"');
   });
});

describe('removeJsoncProperty', () => {
   it('removes a property while preserving other comments', () => {
      const jsonc = [
         '{',
         '   // Important comment about theme',
         '   "theme": "dark",',
         '   // Temporary setting',
         '   "debug": true',
         '}',
         '',
      ].join('\n');

      const updated = removeJsoncProperty(jsonc, [ 'debug' ]);

      expect(updated).toContain('// Important comment about theme');
      expect(updated).toContain('"theme": "dark"');
      expect(updated).not.toContain('"debug"');
   });

   it('removes a nested property while preserving siblings and comments', () => {
      const jsonc = [
         '{',
         '   "servers": {',
         '      // Server A is important',
         '      "serverA": { "command": "cmdA" },',
         '      "serverB": { "command": "cmdB" }',
         '   }',
         '}',
         '',
      ].join('\n');

      const updated = removeJsoncProperty(jsonc, [ 'servers', 'serverB' ]);

      expect(updated).toContain('// Server A is important');
      expect(updated).toContain('"serverA"');
      expect(updated).not.toContain('"serverB"');
   });
});

describe('mergeJsonc', () => {
   it('merges deep object while preserving comments on existing keys', () => {
      const jsonc = [
         '{',
         '   // User editor preferences',
         '   "ui": {',
         '      // Keep font size comment',
         '      "fontSize": 14',
         '   },',
         '   // Context servers',
         '   "context_servers": {',
         '      // Custom server comment',
         '      "custom": {',
         '         "command": "custom-mcp"',
         '      }',
         '   }',
         '}',
         '',
      ].join('\n');

      const override = {
         context_servers: {
            aix_added: {
               command: 'aix-mcp',
            },
         },
      };

      const result = mergeJsonc(jsonc, override);

      expect(result).toContain('// User editor preferences');
      expect(result).toContain('// Keep font size comment');
      expect(result).toContain('// Context servers');
      expect(result).toContain('// Custom server comment');
      expect(result).toContain('"custom"');
      expect(result).toContain('"aix_added"');
      expect(result).toContain('"command": "aix-mcp"');
   });

   it('supports custom resolver strategy', () => {
      const jsonc = [
         '{',
         '   "servers": {',
         '      "myServer": { "command": "old-cmd" }',
         '   }',
         '}',
         '',
      ].join('\n');

      const override = {
         servers: {
            myServer: { command: 'new-cmd' },
         },
      };

      // When resolver says 'keep', do not overwrite
      const kept = mergeJsonc(jsonc, override, {
         resolver: ({ key }) => {
            return key === 'myServer' ? 'keep' : undefined;
         },
      });

      expect(kept).toContain('old-cmd');
      expect(kept).not.toContain('new-cmd');
   });
});

describe('applyJsoncDiff', () => {
   it('applies additions, modifications, and deletions preserving comments', () => {
      const jsonc = [
         '// Top header comment',
         '{',
         '   // Version tag',
         '   "version": "1.0",',
         '   // Rules array',
         '   "rules": [ "rule1" ],',
         '   "toDelete": true',
         '}',
         '',
      ].join('\n');

      const newObject = {
         version: '2.0',
         rules: [ 'rule1' ],
         addedKey: 'hello',
      };

      const result = applyJsoncDiff(jsonc, newObject);

      expect(result).toContain('// Top header comment');
      expect(result).toContain('// Version tag');
      expect(result).toContain('"version": "2.0"');
      expect(result).toContain('// Rules array');
      expect(result).toContain('"addedKey": "hello"');
      expect(result).not.toContain('"toDelete"');
   });
});
