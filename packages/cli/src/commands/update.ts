import { Command, Flags } from '@oclif/core';
import { confirmAction } from '../lib/confirm.js';
import { Output } from '../lib/output.js';
import { applyCLIUpdate, checkForCLIUpdate, getUpdateInstallation } from '../lib/update-installation.js';
import { getCheckForUpdates } from '../lib/update-settings.js';

export default class Update extends Command {
   static override description = 'Update aix using the package manager that installed it';

   static override flags = {
      check: Flags.boolean({ description: 'Check whether an update is available' }),
      yes: Flags.boolean({ char: 'y', description: 'Allow this run even when automatic update checks are disabled' }),
      json: Flags.boolean({ description: 'Output as JSON' }),
   };

   async run(): Promise<void> {
      const { flags } = await this.parse(Update),
            output = new Output({ quiet: false, json: flags.json }),
            current = this.config.version;

      if (!flags.yes && !await getCheckForUpdates()) {
         if (flags.json) {
            this.error('Automatic update checks are disabled. Pass --yes to check once.');
         }

         const confirmed = await confirmAction('Check for an aix update this time?', this.error.bind(this));

         if (!confirmed) {
            output.log('Skipped the update check.');
            return;
         }
      }

      const installation = await getUpdateInstallation(this.config.root);

      if (!installation) {
         this.error('Could not identify this aix install as global npm or Homebrew. Update it the same way you installed it.');
      }

      const update = await checkForCLIUpdate(installation, current, true),
            manager = installation.manager;

      if (!update) {
         output.log(`No update available for aix ${current} through ${manager}.`);
         output.json({ current, manager, updated: false });
         return;
      }

      if (update.pinned || flags.check) {
         output.log(update.pinned
            ? `Update available (${update.version}). Homebrew has pinned aix.`
            : `Update available (${update.version}). Run aix update.`);
         output.json({ current, manager, available: update.version, pinned: update.pinned ?? false, updated: false });
         return;
      }

      await applyCLIUpdate(installation, update, flags.json);
      output.success(`aix update completed through ${manager}.`);
      output.json({ current, manager, available: update.version, updated: true });
   }
}
