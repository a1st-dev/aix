import { describe, it, expect } from 'vitest';
import {
   deepMergeJson,
   createPathResolver,
   mcpConfigMergeResolver,
   type MergeContext,
} from '../json.js';

describe('deepMergeJson', () => {
   describe('default behavior', () => {
      it('merges nested objects recursively', () => {
         const base = { a: { x: 1, y: 2 } },
               override = { a: { y: 3, z: 4 } },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: { x: 1, y: 3, z: 4 } });
      });

      it('replaces arrays entirely', () => {
         const base = { items: [1, 2, 3] },
               override = { items: [4, 5] },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ items: [4, 5] });
      });

      it('replaces primitives', () => {
         const base = { name: 'old', count: 1 },
               override = { name: 'new', count: 2 },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ name: 'new', count: 2 });
      });

      it('adds new keys from override', () => {
         const base = { a: 1 },
               override = { b: 2 },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: 1, b: 2 });
      });

      it('preserves keys not in override', () => {
         const base = { a: 1, b: 2, c: 3 },
               override = { b: 20 },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: 1, b: 20, c: 3 });
      });

      it('handles deeply nested objects', () => {
         const base = { a: { b: { c: { d: 1 } } } },
               override = { a: { b: { c: { e: 2 } } } },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: { b: { c: { d: 1, e: 2 } } } });
      });

      it('replaces object with primitive when types differ', () => {
         const base = { a: { nested: true } },
               override = { a: 'string' },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: 'string' });
      });

      it('replaces primitive with object when types differ', () => {
         const base = { a: 'string' },
               override = { a: { nested: true } },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: { nested: true } });
      });

      it('handles null values', () => {
         const base = { a: { b: 1 } },
               override = { a: null },
               result = deepMergeJson(base, override);

         expect(result).toEqual({ a: null });
      });

      it('does not mutate original objects', () => {
         const base = { a: { x: 1 } },
               override = { a: { y: 2 } };

         deepMergeJson(base, override);

         expect(base).toEqual({ a: { x: 1 } });
         expect(override).toEqual({ a: { y: 2 } });
      });
   });

   describe('with custom resolver', () => {
      it('uses keep strategy to preserve old value', () => {
         const base = { a: 'old', b: 'old' },
               override = { a: 'new', b: 'new' },
               result = deepMergeJson(base, override, {
                  resolver: ({ key }) => (key === 'a' ? 'keep' : undefined),
               });

         expect(result).toEqual({ a: 'old', b: 'new' });
      });

      it('uses replace strategy to skip recursive merge', () => {
         const base = { config: { a: 1, b: 2 } },
               override = { config: { c: 3 } },
               result = deepMergeJson(base, override, {
                  resolver: ({ key }) => (key === 'config' ? 'replace' : undefined),
               });

         // Replace means the entire object is replaced, not merged
         expect(result).toEqual({ config: { c: 3 } });
      });

      it('provides correct context to resolver', () => {
         const contexts: MergeContext[] = [],
               base = { outer: { inner: 'old' } },
               override = { outer: { inner: 'new' } };

         deepMergeJson(base, override, {
            resolver: (ctx) => {
               contexts.push({ ...ctx });
               return undefined;
            },
         });

         expect(contexts).toHaveLength(2);
         expect(contexts[0]).toEqual({
            key: 'outer',
            path: [],
            oldValue: { inner: 'old' },
            newValue: { inner: 'new' },
         });
         expect(contexts[1]).toEqual({
            key: 'inner',
            path: ['outer'],
            oldValue: 'old',
            newValue: 'new',
         });
      });
   });

   describe('createPathResolver', () => {
      it('matches exact paths', () => {
         const resolver = createPathResolver({
            'a.b.c': 'replace',
         });

         expect(resolver({ key: 'c', path: ['a', 'b'], oldValue: 1, newValue: 2 })).toBe('replace');
         expect(resolver({ key: 'd', path: ['a', 'b'], oldValue: 1, newValue: 2 })).toBeUndefined();
      });

      it('matches wildcard paths', () => {
         const resolver = createPathResolver({
            'servers.*': 'replace',
         });

         expect(resolver({ key: 'github', path: ['servers'], oldValue: {}, newValue: {} })).toBe(
            'replace',
         );
         expect(resolver({ key: 'gitlab', path: ['servers'], oldValue: {}, newValue: {} })).toBe(
            'replace',
         );
         expect(
            resolver({ key: 'other', path: ['notservers'], oldValue: {}, newValue: {} }),
         ).toBeUndefined();
      });

      it('matches multiple patterns', () => {
         const resolver = createPathResolver({
            'mcpServers.*': 'replace',
            'context_servers.*': 'replace',
         });

         expect(resolver({ key: 'test', path: ['mcpServers'], oldValue: {}, newValue: {} })).toBe(
            'replace',
         );
         expect(resolver({ key: 'test', path: ['context_servers'], oldValue: {}, newValue: {} })).toBe(
            'replace',
         );
      });
   });

   describe('mcpConfigMergeResolver', () => {
      it('replaces mcpServers entries', () => {
         const base = {
                  mcpServers: {
                     github: { command: 'old', args: ['--old'] },
                     existing: { command: 'keep' },
                  },
               },
               override = {
                  mcpServers: {
                     github: { command: 'new', args: ['--new'] },
                  },
               },
               result = deepMergeJson(base, override, { resolver: mcpConfigMergeResolver });

         expect(result).toEqual({
            mcpServers: {
               github: { command: 'new', args: ['--new'] },
               existing: { command: 'keep' },
            },
         });
      });

      it('replaces context_servers entries (Zed format)', () => {
         const base = {
                  context_servers: {
                     github: { command: 'old' },
                  },
               },
               override = {
                  context_servers: {
                     github: { command: 'new', env: { TOKEN: 'xxx' } },
                  },
               },
               result = deepMergeJson(base, override, { resolver: mcpConfigMergeResolver });

         expect(result).toEqual({
            context_servers: {
               github: { command: 'new', env: { TOKEN: 'xxx' } },
            },
         });
      });

      it('preserves user-added servers not in override', () => {
         const base = {
                  mcpServers: {
                     userAdded: { command: 'user-cmd' },
                  },
               },
               override = {
                  mcpServers: {
                     aixManaged: { command: 'aix-cmd' },
                  },
               },
               result = deepMergeJson(base, override, { resolver: mcpConfigMergeResolver });

         expect(result).toEqual({
            mcpServers: {
               userAdded: { command: 'user-cmd' },
               aixManaged: { command: 'aix-cmd' },
            },
         });
      });

      it('merges other top-level keys normally', () => {
         const base = {
                  mcpServers: { a: { cmd: 'a' } },
                  otherConfig: { nested: { x: 1 } },
               },
               override = {
                  mcpServers: { b: { cmd: 'b' } },
                  otherConfig: { nested: { y: 2 } },
               },
               result = deepMergeJson(base, override, { resolver: mcpConfigMergeResolver });

         expect(result).toEqual({
            mcpServers: { a: { cmd: 'a' }, b: { cmd: 'b' } },
            otherConfig: { nested: { x: 1, y: 2 } },
         });
      });
   });
});
