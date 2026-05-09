import type {
   RuntimeAdapter,
   RuntimeDirent,
   RuntimeEncoding,
   RuntimeGitDownloadOptions,
   RuntimeGitDownloadResult,
} from './types.js';

type NodeFsModule = typeof import('node:fs');
type NodeFsPromisesModule = typeof import('node:fs/promises');
type NodeOsModule = typeof import('node:os');
type NodeUrlModule = typeof import('node:url');
type NodeCryptoModule = typeof import('node:crypto');
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

function getUrlModule(): NodeUrlModule {
   return getBuiltinModule<NodeUrlModule>('url');
}

function getCryptoModule(): NodeCryptoModule {
   return getBuiltinModule<NodeCryptoModule>('crypto');
}

function getFileUrlForPath(path: string): string {
   const url = getUrlModule().pathToFileURL(path).href;

   if (url.endsWith('/')) {
      return url;
   }

   return `${url}/`;
}

async function downloadTemplate(
   template: string,
   options: RuntimeGitDownloadOptions,
): Promise<RuntimeGitDownloadResult> {
   const { downloadTemplate: gigetDownload } = await import('giget');

   return gigetDownload(template, options);
}

async function ensureDependencyInstalled(packageSpec: string, cwd: string): Promise<void> {
   const { ensureDependencyInstalled: nypmEnsureInstalled } = await import('nypm');

   await nypmEnsureInstalled(packageSpec, { cwd });
}

async function resolvePackagePath(packageName: string, projectRoot: string, subpath = 'package.json'): Promise<string> {
   const resolvedUrl = import.meta.resolve(`${packageName}/${subpath}`, getFileUrlForPath(projectRoot));

   return getUrlModule().fileURLToPath(resolvedUrl);
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

function readFile(path: string): Promise<Uint8Array>;
function readFile(path: string, encoding: RuntimeEncoding): Promise<string>;
async function readFile(path: string, encoding?: RuntimeEncoding): Promise<string | Uint8Array> {
   if (!encoding || encoding === 'binary') {
      return getFsPromisesModule().readFile(path);
   }

   return getFsPromisesModule().readFile(path, encoding);
}

function readFileSync(path: string): Uint8Array;
function readFileSync(path: string, encoding: RuntimeEncoding): string;
function readFileSync(path: string, encoding?: RuntimeEncoding): string | Uint8Array {
   if (!encoding || encoding === 'binary') {
      return getFsModule().readFileSync(path);
   }

   return getFsModule().readFileSync(path, encoding);
}

export const nodeRuntimeAdapter: RuntimeAdapter = {
   crypto: {
      createHash: (algorithm) => {
         return getCryptoModule().createHash(algorithm);
      },
      randomUUID: () => {
         return getCryptoModule().randomUUID();
      },
      base64url: (data) => {
         return getBuiltinModule<{ Buffer: typeof Buffer }>('buffer').Buffer.from(data).toString('base64url');
      },
   },
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
      byteLength: (content) => {
         return getBuiltinModule<{ Buffer: typeof Buffer }>('buffer').Buffer.byteLength(content, 'utf-8');
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
      readFile,
      readFileSync,
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
      writeFile: async (path, content, encoding) => {
         if (encoding === 'binary') {
            await getFsPromisesModule().writeFile(path, content as Uint8Array);
            return;
         }
         await getFsPromisesModule().writeFile(path, content as string, encoding ?? 'utf-8');
      },
   },
   git: {
      downloadTemplate,
   },
   host: {
      supportsGlobalHomeAccess: () => {
         return true;
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
   npm: {
      ensureDependencyInstalled,
      resolvePackagePath,
   },
   os: {
      homedir: () => {
         const env = getNodeProcess().env;

         if (env.HOME) {
            return env.HOME;
         }
         if (env.USERPROFILE) {
            return env.USERPROFILE;
         }

         return getOsModule().homedir();
      },
      platform: () => {
         return getOsModule().platform();
      },
      tmpdir: () => {
         return getOsModule().tmpdir();
      },
      fileURLToPath: (url) => {
         return getUrlModule().fileURLToPath(url);
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
