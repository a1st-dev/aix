import { dirname } from 'pathe';
import { getRuntimeAdapter } from '../runtime/index.js';
import { createBackup } from '../backup.js';
import { safeRm } from '../fs/safe-rm.js';
import type { FileChange } from './types.js';

export function getFileChangeAction(existing: string | null, desired: string): 'create' | 'update' | 'unchanged';
export function getFileChangeAction(existing: string | null, desired: string | undefined): FileChange['action'];
export function getFileChangeAction(existing: string | null, desired: string | undefined): FileChange['action'] {
   if (desired === undefined) {
      return 'delete';
   }
   if (existing === null) {
      return 'create';
   }
   return existing === desired ? 'unchanged' : 'update';
}

/** Apply an editor install and its receipt together, rolling back failed file writes. */
export async function applyFileChanges(changes: FileChange[]): Promise<void> {
   const applied: Array<{ path: string; originalContent: string | null; movedDirectory?: string }> = [];

   try {
      for (const change of changes) {
         // Skip unchanged and directory changes (directories are already copied elsewhere)
         if (change.action === 'unchanged' || (change.isDirectory && change.action !== 'delete')) {
            continue;
         }

         if (change.isDirectory) {
            const movedDirectory = `${change.path}.aix-remove-${getRuntimeAdapter().crypto.randomUUID()}`;

            // eslint-disable-next-line no-await-in-loop -- Keep removals reversible until every write succeeds.
            await getRuntimeAdapter().fs.rename(change.path, movedDirectory);
            applied.push({ path: change.path, originalContent: null, movedDirectory });
            continue;
         }

         // Store original content for rollback
         let originalContent: string | null = null;

         if (getRuntimeAdapter().fs.existsSync(change.path)) {
            // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
            originalContent = await getRuntimeAdapter().fs.readFile(change.path, 'utf-8');
            // eslint-disable-next-line no-await-in-loop -- Back up before each overwrite
            await createBackup(change.path);
         }
         applied.push({ path: change.path, originalContent });

         if (change.action === 'delete') {
            // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
            await getRuntimeAdapter().fs.rm(change.path, { force: true });
         } else {
            // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
            await getRuntimeAdapter().fs.mkdir(dirname(change.path), { recursive: true });
            // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
            await getRuntimeAdapter().fs.writeFile(change.path, change.content ?? '', 'utf-8');
            if (change.mode !== undefined) {
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic rollback
               await getRuntimeAdapter().fs.chmod(change.path, change.mode);
            }
         }
      }
   } catch (error) {
      // Rollback on failure - must be sequential to restore in reverse order
      for (const { path, originalContent, movedDirectory } of applied.toReversed()) {
         try {
            if (movedDirectory) {
               // eslint-disable-next-line no-await-in-loop -- Restore directories before reporting the failed install.
               await getRuntimeAdapter().fs.rename(movedDirectory, path);
            } else if (originalContent === null) {
               // eslint-disable-next-line no-await-in-loop -- Sequential rollback
               await getRuntimeAdapter().fs.rm(path, { force: true });
            } else {
               // eslint-disable-next-line no-await-in-loop -- Sequential rollback
               await getRuntimeAdapter().fs.writeFile(path, originalContent, 'utf-8');
            }
         } catch {
            // Best effort rollback
         }
      }
      throw error;
   }

   await Promise.all(applied.map(async ({ movedDirectory }) => {
      if (movedDirectory) {
         await safeRm(movedDirectory, { recursive: true, force: true });
      }
   }));
}
