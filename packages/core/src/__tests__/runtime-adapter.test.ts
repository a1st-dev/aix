import { describe, expect, it, afterEach } from 'vitest';
import { resolve } from 'pathe';
import {
   discoverConfig,
   getRuntimeAdapter,
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   setRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../index.js';

afterEach(() => {
   resetRuntimeAdapter();
});

describe('runtime adapter management', () => {
   it('uses the Node runtime adapter by default', () => {
      expect(getRuntimeAdapter()).toBe(nodeRuntimeAdapter);
   });

   it('sets and resets the active runtime adapter', () => {
      const adapter = createVirtualAdapter({});

      setRuntimeAdapter(adapter);
      expect(getRuntimeAdapter()).toBe(adapter);

      resetRuntimeAdapter();
      expect(getRuntimeAdapter()).toBe(nodeRuntimeAdapter);
   });

   it('scopes adapter overrides to the callback', async () => {
      const adapter = createVirtualAdapter({});

      await withRuntimeAdapter(adapter, async () => {
         expect(getRuntimeAdapter()).toBe(adapter);
      });

      expect(getRuntimeAdapter()).toBe(nodeRuntimeAdapter);
   });

   it('restores the previous adapter after a scoped override throws', async () => {
      const adapter = createVirtualAdapter({});

      await expect(
         withRuntimeAdapter(adapter, async () => {
            throw new Error('expected failure');
         }),
      ).rejects.toThrow('expected failure');

      expect(getRuntimeAdapter()).toBe(nodeRuntimeAdapter);
   });

   it('lets public config discovery read from a virtual file system', async () => {
      const projectRoot = resolve('/virtual/project'),
            configPath = resolve(projectRoot, 'ai.json'),
            adapter = createVirtualAdapter({
               [configPath]: '{ "rules": { "general": { "content": "Use adapters." } } }',
            });

      const discovered = await withRuntimeAdapter(adapter, async () => {
         return discoverConfig(projectRoot);
      });

      expect(discovered).toEqual({
         path: configPath,
         content: '{ "rules": { "general": { "content": "Use adapters." } } }',
         source: 'file',
         packageJsonAlsoHasAi: false,
      });
   });
});

function createVirtualAdapter(files: Record<string, string>): RuntimeAdapter {
   const virtualFiles = new Map<string, string | Uint8Array>(Object.entries(files));

   return {
      ...nodeRuntimeAdapter,
      fs: {
         ...nodeRuntimeAdapter.fs,
         existsSync: (path) => {
            return virtualFiles.has(path);
         },
         readFile,
         readFileSync,
         writeFile: async (path, content) => {
            virtualFiles.set(path, content);
         },
      },
      os: {
         ...nodeRuntimeAdapter.os,
         homedir: () => {
            return resolve('/virtual/home');
         },
         tmpdir: () => {
            return resolve('/virtual/tmp');
         },
      },
      process: {
         ...nodeRuntimeAdapter.process,
         cwd: () => {
            return resolve('/virtual/project');
         },
         pid: () => {
            return 12345;
         },
      },
   };

   function readFile(path: string): Promise<Uint8Array>;
   function readFile(path: string, encoding: 'utf-8' | 'utf8' | 'binary'): Promise<string>;
   async function readFile(path: string, encoding?: 'utf-8' | 'utf8' | 'binary'): Promise<string | Uint8Array> {
      if (encoding === undefined) {
         return readVirtualFile(virtualFiles, path);
      }

      return readVirtualFile(virtualFiles, path, encoding);
   }

   function readFileSync(path: string): Uint8Array;
   function readFileSync(path: string, encoding: 'utf-8' | 'utf8' | 'binary'): string;
   function readFileSync(path: string, encoding?: 'utf-8' | 'utf8' | 'binary'): string | Uint8Array {
      if (encoding === undefined) {
         return readVirtualFile(virtualFiles, path);
      }

      return readVirtualFile(virtualFiles, path, encoding);
   }
}

function readVirtualFile(files: Map<string, string | Uint8Array>, path: string): Uint8Array;
function readVirtualFile(files: Map<string, string | Uint8Array>, path: string, encoding: 'utf-8' | 'utf8' | 'binary'): string;
function readVirtualFile(
   files: Map<string, string | Uint8Array>,
   path: string,
   encoding?: 'utf-8' | 'utf8' | 'binary',
): string | Uint8Array {
   const content = files.get(path);

   if (content === undefined) {
      throw new Error(`Virtual file not found: ${path}`);
   }

   if (!encoding || encoding === 'binary') {
      return typeof content === 'string' ? new TextEncoder().encode(content) : content;
   }

   return typeof content === 'string' ? content : new TextDecoder().decode(content);
}
