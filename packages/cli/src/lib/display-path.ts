import { isAbsolute, relative } from 'pathe';
import { getRuntimeAdapter } from '@a1st/aix-core';

/**
 * Shorten a path for display without hiding which scope it belongs to: `./...` under the
 * working directory, `~/...` under the home directory, absolute otherwise. The working
 * directory is checked first because a project usually sits inside the home directory.
 */
export function formatDisplayPath(path: string): string {
   const roots = [
      { directory: process.cwd(), prefix: '.' },
      { directory: getRuntimeAdapter().os.homedir(), prefix: '~' },
   ];

   for (const { directory, prefix } of roots) {
      const relativePath = relative(directory, path);

      if (relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
         return `${prefix}/${relativePath}`;
      }
   }

   return path;
}
