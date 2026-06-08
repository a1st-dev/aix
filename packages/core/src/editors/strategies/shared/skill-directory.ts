import { dirname } from 'pathe';
import { safeRm } from '../../../fs/safe-rm.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

export async function getReplacementAction(path: string): Promise<'create' | 'update'> {
   try {
      await getRuntimeAdapter().fs.lstat(path);
      return 'update';
   } catch (error) {
      if (isMissingPathError(error)) {
         return 'create';
      }
      throw error;
   }
}

export async function replaceSkillDirectory(source: string, destination: string): Promise<'create' | 'update'> {
   const action = await getReplacementAction(destination);

   await getRuntimeAdapter().fs.mkdir(dirname(destination), { recursive: true });
   if (action === 'update') {
      await safeRm(destination, { force: true });
   }

   try {
      await getRuntimeAdapter().fs.cp(source, destination, { recursive: true, force: true });
   } catch (error) {
      throw new Error(`Failed to copy skill directory from "${source}" to "${destination}": ${formatError(error)}`, {
         cause: error,
      });
   }

   return action;
}

function isMissingPathError(error: unknown): boolean {
   return isErrnoException(error) && error.code === 'ENOENT';
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
   return error instanceof Error && 'code' in error;
}

function formatError(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}
