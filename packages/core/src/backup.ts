import { resolve, dirname, basename, join } from 'pathe';
import { getBackupsDir } from './cache/paths.js';
import { getRuntimeAdapter } from './runtime/index.js';

export interface BackupOptions {
   maxBackups?: number;
   maxAgeDays?: number;
}

export interface BackupInfo {
   path: string;
   timestamp: Date;
}

export async function createBackup(filePath: string, options: BackupOptions = {}): Promise<BackupInfo> {
   const { maxBackups = 5, maxAgeDays } = options,
         absolutePath = resolve(filePath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
   }

   const fileName = basename(absolutePath),
         fileDir = dirname(absolutePath),
         backupPath = getBackupsDir(fileDir),
         timestamp = new Date(),
         timestampStr = timestamp.toISOString().replace(/[:.]/g, '-'),
         backupFileName = `${fileName}.${timestampStr}.backup`,
         backupFilePath = join(backupPath, backupFileName);

   await fs.mkdir(backupPath, { recursive: true });
   await fs.copyFile(absolutePath, backupFilePath);

   await cleanupOldBackups(backupPath, fileName, maxBackups, maxAgeDays);

   return {
      path: backupFilePath,
      timestamp,
   };
}

export async function restoreBackup(backupPath: string, targetPath: string): Promise<void> {
   const absoluteBackupPath = resolve(backupPath),
         absoluteTargetPath = resolve(targetPath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(absoluteBackupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
   }

   await fs.copyFile(absoluteBackupPath, absoluteTargetPath);
}

export async function listBackups(filePath: string, backupDir?: string): Promise<BackupInfo[]> {
   const absolutePath = resolve(filePath),
         fileName = basename(absolutePath),
         fileDir = dirname(absolutePath),
         backupPath = backupDir ? resolve(fileDir, backupDir) : getBackupsDir(fileDir),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(backupPath)) {
      return [];
   }

   const files = await fs.readdir(backupPath),
         backups: BackupInfo[] = [];

   for (const file of files) {
      if (file.startsWith(fileName) && file.endsWith('.backup')) {
         const match = file.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.backup$/);

         if (match?.[1]) {
            const timestampStr = match[1].replace(/-/g, (m, offset) => {
               if (offset < 10) {
                  return m;
               }
               if (offset === 13 || offset === 16) {
                  return ':';
               }
               if (offset === 19) {
                  return '.';
               }
               return m;
            });

            backups.push({
               path: join(backupPath, file),
               timestamp: new Date(timestampStr),
            });
         }
      }
   }

   return backups.toSorted((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

async function cleanupOldBackups(
   backupPath: string,
   fileName: string,
   maxBackups: number,
   maxAgeDays?: number,
): Promise<void> {
   const backups = await listBackups(join(backupPath, '..', fileName), basename(backupPath));

   // Delete by count (keep newest maxBackups)
   if (backups.length > maxBackups) {
      const toDelete = backups.slice(maxBackups);

      await Promise.all(toDelete.map((backup) => getRuntimeAdapter().fs.unlink(backup.path)));
   }

   // Delete by age
   if (maxAgeDays !== undefined) {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000,
            oldBackups = backups.filter((b) => b.timestamp.getTime() < cutoff);

      await Promise.all(oldBackups.map((backup) => getRuntimeAdapter().fs.unlink(backup.path)));
   }
}
