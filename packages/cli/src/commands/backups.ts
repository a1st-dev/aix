import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'pathe';
import { BaseCommand } from '../base-command.js';

interface BackupInfo {
   file: string;
   originalPath: string;
   backupDate: Date;
   size: number;
   location: 'global' | 'local';
}

/**
 * Parse a backup filename to extract the original path and timestamp.
 * Format: {safe_relative_path}.{timestamp}.bak
 * Example: .codeium_windsurf_mcp_config.json.2026-01-05T18-25-43-275Z.bak
 */
function parseBackupFilename(filename: string): { originalPath: string; timestamp: Date } | null {
   // Remove .bak extension
   if (!filename.endsWith('.bak')) {
      return null;
   }

   const withoutExt = filename.slice(0, -4),
         // Find the timestamp (ISO format with dashes instead of colons)
         // Pattern: .YYYY-MM-DDTHH-MM-SS-mmmZ
         timestampMatch = withoutExt.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);

   if (!timestampMatch || !timestampMatch[1]) {
      return null;
   }

   const timestampStr = timestampMatch[1],
         // Convert back to ISO format (replace dashes with colons in time part)
         isoTimestamp = timestampStr.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z'),
         timestamp = new Date(isoTimestamp);

   if (isNaN(timestamp.getTime())) {
      return null;
   }

   // Extract original path (everything before the timestamp)
   // The safe path has underscores instead of slashes, and starts with a dot
   const safePath = withoutExt.slice(0, -(timestampStr.length + 1)),
         // Convert underscores back to slashes, but keep leading dot
         originalPath = safePath.startsWith('.')
            ? '~/' + safePath.slice(1).replace(/_/g, '/')
            : '~/' + safePath.replace(/_/g, '/');

   return { originalPath, timestamp };
}

export default class Backups extends BaseCommand<typeof Backups> {
   static override description = `List backup files created by aix

When aix modifies editor configuration files (e.g., during install), it automatically creates local backups of the original files. Use these to recover from errors or restore a previous state by manually copying files from the backup directory.`;

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      // Match the backup location used by global/processor.ts: ~/.aix/backups/
      const backups: BackupInfo[] = [],
            globalBackupDir = join(homedir(), '.aix', 'backups'),
            localBackupDir = join(process.cwd(), '.aix', 'backups');

      if (existsSync(globalBackupDir)) {
         const files = await readdir(globalBackupDir);

         for (const file of files) {
            const parsed = parseBackupFilename(file);

            if (!parsed) {
               continue;
            }

            const filePath = join(globalBackupDir, file);

            try {
               // eslint-disable-next-line no-await-in-loop -- Sequential for simplicity
               const stats = await stat(filePath);

               backups.push({
                  file,
                  originalPath: parsed.originalPath,
                  backupDate: parsed.timestamp,
                  size: stats.size,
                  location: 'global',
               });
            } catch {
               // Skip files we can't stat
            }
         }
      }

      // Check local backups
      if (existsSync(localBackupDir)) {
         const files = await readdir(localBackupDir);

         for (const file of files) {
            const parsed = parseBackupFilename(file);

            if (!parsed) {
               continue;
            }

            const filePath = join(localBackupDir, file);

            try {
               // eslint-disable-next-line no-await-in-loop -- Sequential for simplicity
               const stats = await stat(filePath);

               backups.push({
                  file,
                  originalPath: parsed.originalPath,
                  backupDate: parsed.timestamp,
                  size: stats.size,
                  location: 'local',
               });
            } catch {
               // Skip files we can't stat
            }
         }
      }

      // Sort by date, newest first
      backups.sort((a, b) => b.backupDate.getTime() - a.backupDate.getTime());

      if (this.flags.json) {
         this.output.json(backups);
         return;
      }

      if (backups.length === 0) {
         this.output.info('No backups found');
         this.output.info('Backups are created automatically when aix modifies global config files');
         this.output.info(`\nBackup locations:\n  Global: ${globalBackupDir.replace(homedir(), '~')}\n  Local:  ${localBackupDir.replace(process.cwd(), '.')}`);
         return;
      }

      this.output.header(`Backups (${backups.length})`);

      const rows = backups.map((b) => ({
         location: b.location,
         originalPath: b.originalPath,
         date: this.formatDate(b.backupDate),
         size: this.formatSize(b.size),
         file: b.file,
      }));

      this.output.table(rows, {
         columns: [
            { key: 'location', name: 'Location' },
            { key: 'originalPath', name: 'Original File' },
            { key: 'date', name: 'Backup Date' },
            { key: 'size', name: 'Size' },
         ],
      });

      this.output.info(`\nBackup directories:\n  Global: ${globalBackupDir.replace(homedir(), '~')}\n  Local:  ${localBackupDir.replace(process.cwd(), '.')}`);
   }

   private formatDate(date: Date): string {
      return date.toLocaleString('en-US', {
         year: 'numeric',
         month: 'short',
         day: 'numeric',
         hour: '2-digit',
         minute: '2-digit',
      });
   }

   private formatSize(bytes: number): string {
      if (bytes < 1024) {
         return `${bytes} B`;
      }

      if (bytes < 1024 * 1024) {
         return `${(bytes / 1024).toFixed(1)} KB`;
      }

      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
   }
}
