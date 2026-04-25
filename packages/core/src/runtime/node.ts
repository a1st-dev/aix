import type { RuntimeAdapter, RuntimeDirent } from './types.js';

type NodeFsModule = typeof import('node:fs');
type NodeFsPromisesModule = typeof import('node:fs/promises');
type NodeOsModule = typeof import('node:os');
type BuiltinModuleProcess = NodeJS.Process & {
   getBuiltinModule(id: string): unknown;
};

function getBuiltinModule<T>(id: string): T {
   const runtimeProcess = globalThis.process as BuiltinModuleProcess | undefined,
         getModule = runtimeProcess?.getBuiltinModule;

   if (!getModule) {
      throw new Error(`Node builtin module loader is unavailable for: ${id}`);
   }

   const builtin = getModule(id) ?? getModule(`node:${id}`);

   if (!builtin) {
      throw new Error(`Failed to resolve Node builtin module: ${id}`);
   }

   return builtin as T;
}

function getFsModule(): NodeFsModule {
   return getBuiltinModule<NodeFsModule>('fs');
}

function getFsPromisesModule(): NodeFsPromisesModule {
   return getBuiltinModule<NodeFsPromisesModule>('fs/promises');
}

function getOsModule(): NodeOsModule {
   return getBuiltinModule<NodeOsModule>('os');
}

function getNodeProcess(): NodeJS.Process {
   const runtimeProcess = globalThis.process;

   if (!runtimeProcess) {
      throw new Error('Node process is unavailable.');
   }

   return runtimeProcess;
}

function readdir(path: string): Promise<string[]>;
function readdir(path: string, options: { withFileTypes: true }): Promise<RuntimeDirent[]>;
async function readdir(
   path: string,
   options?: { withFileTypes: true },
): Promise<RuntimeDirent[] | string[]> {
   if (options?.withFileTypes) {
      const entries = await getFsPromisesModule().readdir(path, { withFileTypes: true });

      return entries.map((entry) => ({
         name: entry.name,
         isDirectory: () => {
            return entry.isDirectory();
         },
         isFile: () => {
            return entry.isFile();
         },
         isSymbolicLink: () => {
            return entry.isSymbolicLink();
         },
      }));
   }

   return getFsPromisesModule().readdir(path);
}

export const nodeRuntimeAdapter: RuntimeAdapter = {
   fs: {
      constants: {
         get F_OK() {
            return getFsPromisesModule().constants.F_OK;
         },
         get R_OK() {
            return getFsPromisesModule().constants.R_OK;
         },
         get W_OK() {
            return getFsPromisesModule().constants.W_OK;
         },
      },
      access: async (path, mode) => {
         await getFsPromisesModule().access(path, mode);
      },
      chmod: async (path, mode) => {
         await getFsPromisesModule().chmod(path, mode);
      },
      copyFile: async (source, destination) => {
         await getFsPromisesModule().copyFile(source, destination);
      },
      cp: async (source, destination, options) => {
         await getFsPromisesModule().cp(source, destination, options);
      },
      existsSync: (path) => {
         return getFsModule().existsSync(path);
      },
      lstat: async (path) => {
         return getFsPromisesModule().lstat(path);
      },
      mkdir: async (path, options) => {
         await getFsPromisesModule().mkdir(path, options);
      },
      mkdtemp: async (prefix) => {
         return getFsPromisesModule().mkdtemp(prefix);
      },
      readFile: async (path, encoding = 'utf-8') => {
         return getFsPromisesModule().readFile(path, encoding);
      },
      readFileSync: (path, encoding = 'utf-8') => {
         return getFsModule().readFileSync(path, encoding);
      },
      readdir,
      readlink: async (path) => {
         return getFsPromisesModule().readlink(path, 'utf-8');
      },
      rename: async (source, destination) => {
         await getFsPromisesModule().rename(source, destination);
      },
      rm: async (path, options) => {
         await getFsPromisesModule().rm(path, options);
      },
      stat: async (path) => {
         return getFsPromisesModule().stat(path);
      },
      symlink: async (target, path, type) => {
         await getFsPromisesModule().symlink(target, path, type);
      },
      unlink: async (path) => {
         await getFsPromisesModule().unlink(path);
      },
      writeFile: async (path, content, encoding = 'utf-8') => {
         await getFsPromisesModule().writeFile(path, content, encoding);
      },
   },
   network: {
      createAbortController: () => {
         return new AbortController();
      },
      fetch: async (input, init) => {
         if (init) {
            return fetch(input, init);
         }
         return fetch(input);
      },
   },
   os: {
      homedir: () => {
         return getNodeProcess().env.HOME ?? getOsModule().homedir();
      },
      platform: () => {
         return getOsModule().platform();
      },
      tmpdir: () => {
         return getOsModule().tmpdir();
      },
   },
   process: {
      get env() {
         return getNodeProcess().env;
      },
      cwd: () => {
         return getNodeProcess().cwd();
      },
      pid: () => {
         return getNodeProcess().pid;
      },
   },
};
