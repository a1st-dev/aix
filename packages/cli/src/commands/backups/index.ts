import { getBackupStoreDir, listAllBackups } from '@a1st/aix-core';
import { BaseCommand } from '../../base-command.js';
import { formatDisplayPath } from '../../lib/display-path.js';

const BYTES_PER_KILOBYTE = 1024;

function formatDate(date: Date): string {
   return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
   });
}

function formatSize(bytes: number): string {
   if (bytes < BYTES_PER_KILOBYTE) {
      return `${bytes} B`;
   }
   if (bytes < BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE) {
      return `${(bytes / BYTES_PER_KILOBYTE).toFixed(1)} KB`;
   }

   return `${(bytes / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE)).toFixed(1)} MB`;
}

export default class Backups extends BaseCommand<typeof Backups> {
   static override description = `List the backups aix made before changing files

Before aix changes or deletes an existing file, it copies the file into one backup store under your home directory. Restore a file with \`aix backups restore <backup file>\`.`;

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const backups = await listAllBackups();

      if (this.flags.json) {
         this.output.json(backups.map((backup) => {
            return {
               path: backup.path,
               originalPath: backup.originalPath,
               isDirectory: backup.isDirectory,
               backupDate: backup.timestamp,
               size: backup.size,
            };
         }));
         return;
      }

      if (backups.length === 0) {
         this.output.info('No backups found');
         this.output.info(`Backups are kept in ${formatDisplayPath(getBackupStoreDir())}`);
         return;
      }

      this.output.header(`Backups (${backups.length})`);
      this.output.table(
         backups.map((backup) => {
            return {
               originalPath: backup.originalPath ? `${formatDisplayPath(backup.originalPath)}${backup.isDirectory ? '/' : ''}` : 'unknown',
               date: formatDate(backup.timestamp),
               size: formatSize(backup.size),
               path: formatDisplayPath(backup.path),
            };
         }),
         {
            columns: [
               { key: 'originalPath', name: 'Original File' },
               { key: 'date', name: 'Backup Date' },
               { key: 'size', name: 'Size' },
               { key: 'path', name: 'Backup File' },
            ],
         },
      );
      this.output.info('\nRestore one with: aix backups restore <backup file>');
   }
}
