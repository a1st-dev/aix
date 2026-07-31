import { basename, dirname, join } from 'pathe';
import { safeRm } from '../../../fs/safe-rm.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

interface SkillReplacementTransaction {
   destination: string;
   stagingPath: string;
   backupPath: string;
   originalMoved: boolean;
}

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
   const adapter = getRuntimeAdapter(),
         action = await getReplacementAction(destination),
         parentDir = dirname(destination),
         transactionID = adapter.crypto.randomUUID(),
         stagingPath = join(parentDir, `.${basename(destination)}.${transactionID}.staging`),
         backupPath = join(parentDir, `.${basename(destination)}.${transactionID}.backup`);

   await adapter.fs.mkdir(parentDir, { recursive: true });
   await safeRm(stagingPath, { force: true });
   await safeRm(backupPath, { force: true });

   try {
      await adapter.fs.cp(source, stagingPath, { recursive: true, force: true });
   } catch (error) {
      await safeRm(stagingPath, { force: true });
      throw new Error(`Failed to stage skill directory from "${source}" to "${destination}": ${formatError(error)}`, {
         cause: error,
      });
   }

   let originalMoved = false;

   try {
      if (action === 'update') {
         await adapter.fs.rename(destination, backupPath);
         originalMoved = true;
      }
      await adapter.fs.rename(stagingPath, destination);
   } catch (error) {
      await restoreSkillDirectory(adapter, { destination, stagingPath, backupPath, originalMoved });
      throw new Error(`Failed to replace skill directory at "${destination}": ${formatError(error)}`, {
         cause: error,
      });
   }

   await safeRm(backupPath, { force: true });
   return action;
}

async function restoreSkillDirectory(
   adapter: ReturnType<typeof getRuntimeAdapter>,
   transaction: SkillReplacementTransaction,
): Promise<void> {
   const { destination, stagingPath, backupPath, originalMoved } = transaction;

   await safeRm(stagingPath, { force: true });

   if (!originalMoved) {
      return;
   }

   await safeRm(destination, { force: true });
   await adapter.fs.rename(backupPath, destination);
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
