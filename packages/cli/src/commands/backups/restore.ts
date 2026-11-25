import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { listAllBackups, restoreBackup } from '@a1st/aix-core';
import { BaseCommand } from '../../base-command.js';
import { confirmAction } from '../../lib/confirm.js';

export default class BackupsRestore extends BaseCommand<typeof BackupsRestore> {
   static override description = `Restore a file from a backup

Copies a backup back over the file it was taken from. The file being replaced is backed up first, so a restore can be undone the same way.`;

   static override examples = [
      '<%= config.bin %> <%= command.id %> ~/.aix/backups/home/.codex/config.toml.2026-01-15T10-30-00-000Z.backup',
      '<%= config.bin %> <%= command.id %> <backup file> --to ./config.toml',
   ];

   static override args = {
      backup: Args.string({
         description: 'Backup file to restore, as listed by `aix backups`',
         required: true,
      }),
   };

   static override flags = {
      to: Flags.string({
         description: 'Restore to this path instead of the file the backup was taken from',
      }),
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args } = await this.parse(BackupsRestore),
            backupPath = resolve(args.backup),
            stored = (await listAllBackups()).find((backup) => {
               return backup.path === backupPath;
            }),
            destination = this.flags.to ? resolve(this.flags.to) : stored?.originalPath;

      if (!destination) {
         this.error(`Cannot tell which file ${args.backup} is a backup of. Pass --to <path> to choose where to restore it.`);
      }

      if (!this.flags.yes && !await confirmAction(`Replace ${destination} with this backup?`, this.error.bind(this))) {
         this.output.info('Cancelled');
         return;
      }

      await restoreBackup(backupPath, destination);

      if (this.flags.json) {
         this.output.json({ action: 'restore', backup: backupPath, restoredTo: destination });
         return;
      }
      this.output.success(`Restored ${destination}`);
   }
}
