import { existsSync } from 'node:fs';
import { Flags } from '@oclif/core';
import { GlobalTrackingService } from '@a1st/aix-core';
import { BaseCommand } from '../../base-command.js';

type OrphanedEntry = {
   key: string;
   editor: string;
   type: string;
   name: string;
   reason: string;
};

export default class GlobalCleanup extends BaseCommand<typeof GlobalCleanup> {
   static override description = 'Find and clean up orphaned global configurations';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --dry-run',
      '<%= config.bin %> <%= command.id %> --force',
   ];

   static override flags = {
      ...BaseCommand.baseFlags,
      'dry-run': Flags.boolean({
         description: 'Show what would be cleaned up without making changes',
         default: false,
      }),
      force: Flags.boolean({
         char: 'f',
         description: 'Remove orphaned entries without confirmation',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const tracking = new GlobalTrackingService(),
            data = await tracking.load(),
            entries = Object.entries(data.entries),
            orphaned: OrphanedEntry[] = [];

      // Find orphaned entries (no projects depend on them, or projects don't exist)
      for (const [key, entry] of entries) {
         // Check if any projects still exist
         const existingProjects = entry.projects.filter((p) => existsSync(p));

         if (existingProjects.length === 0) {
            orphaned.push({
               key,
               editor: entry.editor,
               type: entry.type,
               name: entry.name,
               reason: entry.projects.length === 0
                  ? 'No projects depend on this'
                  : 'All dependent projects have been removed',
            });
         } else if (existingProjects.length < entry.projects.length) {
            // Some projects were removed - update tracking
            if (!this.flags['dry-run']) {
               // eslint-disable-next-line no-await-in-loop -- Sequential updates
               await tracking.save({
                  ...data,
                  entries: {
                     ...data.entries,
                     [key]: { ...entry, projects: existingProjects },
                  },
               });
            }
            this.output.info(`Updated ${key}: removed ${entry.projects.length - existingProjects.length} missing project(s)`);
         }
      }

      if (this.flags.json) {
         this.output.json({ orphaned });
         return;
      }

      if (orphaned.length === 0) {
         this.output.info('No orphaned global configurations found');
         return;
      }

      this.output.header('Orphaned Global Configurations');
      this.output.table(orphaned, {
         columns: [
            { key: 'editor', name: 'Editor' },
            { key: 'type', name: 'Type' },
            { key: 'name', name: 'Name' },
            { key: 'reason', name: 'Reason' },
         ],
      });

      if (this.flags['dry-run']) {
         this.output.info(`\nDry run: ${orphaned.length} orphaned entry/entries would be removed from tracking`);
         this.output.info('Note: This only removes tracking entries, not the actual global config files');
         return;
      }

      if (!this.flags.force) {
         this.output.warn('\nUse --force to remove these entries from tracking');
         this.output.info('Note: This only removes tracking entries, not the actual global config files');
         return;
      }

      // Remove orphaned entries
      for (const entry of orphaned) {
         // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
         await tracking.removeEntry(entry.key);
         this.output.info(`Removed tracking for ${entry.key}`);
      }

      this.output.info(`\nCleaned up ${orphaned.length} orphaned tracking entry/entries`);
   }
}
