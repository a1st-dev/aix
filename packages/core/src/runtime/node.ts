import { existsSync, readFileSync } from 'node:fs';
import {
   access,
   chmod,
   constants,
   copyFile,
   cp,
   lstat,
   mkdir,
   mkdtemp,
   readFile,
   readdir,
   readlink,
   rename,
   rm,
   stat,
   symlink,
   unlink,
   writeFile,
} from 'node:fs/promises';
import { homedir, platform, tmpdir } from 'node:os';
import type { RuntimeAdapter } from './types.js';

export const nodeRuntimeAdapter: RuntimeAdapter = {
   fs: {
      constants: {
         F_OK: constants.F_OK,
         R_OK: constants.R_OK,
         W_OK: constants.W_OK,
      },
      access,
      chmod,
      copyFile,
      cp,
      existsSync,
      lstat,
      mkdir: async (path, options) => {
         await mkdir(path, options);
      },
      mkdtemp,
      readFile: async (path, encoding = 'utf-8') => {
         return readFile(path, encoding);
      },
      readFileSync: (path, encoding = 'utf-8') => {
         return readFileSync(path, encoding);
      },
      readdir,
      readlink: async (path) => {
         return readlink(path, 'utf-8');
      },
      rename,
      rm,
      stat,
      symlink,
      unlink,
      writeFile: async (path, content, encoding = 'utf-8') => {
         await writeFile(path, content, encoding);
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
      homedir,
      platform,
      tmpdir,
   },
   process: {
      env: process.env,
      cwd: () => {
         return process.cwd();
      },
      pid: () => {
         return process.pid;
      },
   },
};
