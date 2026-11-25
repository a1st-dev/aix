import { dirname } from 'pathe';
import { getRuntimeAdapter } from '../runtime/index.js';
import type { RuntimeStats } from '../runtime/index.js';

const PERMISSION_BITS = 0o777;

async function lstatIfExists(path: string): Promise<RuntimeStats | undefined> {
   try {
      return await getRuntimeAdapter().fs.lstat(path);
   } catch {
      return undefined;
   }
}

/**
 * Write a file so that a reader, or a crash, never sees it half written: the content goes to
 * a temporary file beside the target, which is then renamed over it. Editors rewrite files such
 * as `~/.claude.json` while they run, and a truncated copy of one loses the user's settings.
 *
 * The target keeps its permissions. A symlink is written through rather than replaced, because
 * a rename would swap the link for a regular file and detach it from a dotfiles repository.
 */
export async function replaceFile(path: string, content: string): Promise<void> {
   const { fs, crypto } = getRuntimeAdapter(),
         existing = await lstatIfExists(path);

   await fs.mkdir(dirname(path), { recursive: true });

   if (existing?.isSymbolicLink()) {
      await fs.writeFile(path, content, 'utf-8');
      return;
   }

   const temporaryPath = `${path}.aix-${crypto.randomUUID()}.tmp`;

   try {
      await fs.writeFile(temporaryPath, content, 'utf-8');
      if (existing) {
         await fs.chmod(temporaryPath, existing.mode & PERMISSION_BITS);
      }
      await fs.rename(temporaryPath, path);
   } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
   }
}
