import { isAbsolute, relative, resolve } from 'pathe';
import { getRuntimeAdapter, USER_HOME_ENV_VAR } from '../../../runtime/index.js';

export const LEGACY_COPILOT_DIR: string = '.config/github-copilot';

export function getGlobalCopilotDir(): string {
   const { process } = getRuntimeAdapter(),
         configured = process.env.COPILOT_HOME;

   if (!configured) {
      return '.copilot';
   }

   const path = resolve(process.cwd(), configured),
         isolatedHome = process.env[USER_HOME_ENV_VAR];

   if (isolatedHome) {
      const localPath = relative(resolve(isolatedHome), path);

      // An explicit aix home must keep user-scope writes in the selected sandbox.
      if (isAbsolute(localPath) || localPath === '..' || localPath.startsWith('../')) {
         return '.copilot';
      }
   }

   return path;
}
