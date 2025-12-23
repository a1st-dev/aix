import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';

export default class ConfigShow extends BaseCommand<typeof ConfigShow> {
   static override description = 'Show the current configuration';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --resolved',
   ];

   static override flags = {
      resolved: Flags.boolean({
         char: 'r',
         description: 'Show the final merged configuration (after extends and local overrides)',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { flags } = await this.parse(ConfigShow),
            loaded = await this.requireConfig();

      if (flags.resolved || this.flags.json) {
         // Show the fully resolved/merged config
         if (this.flags.json) {
            this.output.json({
               path: loaded.path,
               ...(loaded.localPath && { localPath: loaded.localPath }),
               ...(loaded.hasLocalOverrides && { hasLocalOverrides: loaded.hasLocalOverrides }),
               config: loaded.config,
            });
         } else {
            if (loaded.hasLocalOverrides && loaded.localPath) {
               this.output.info(`Resolved from: ${loaded.path} + ${loaded.localPath}`);
            } else {
               this.output.info(`Resolved from: ${loaded.path}`);
            }
            this.output.log(JSON.stringify(loaded.config, null, 2));
         }
      } else {
         // Show summary of config sources
         this.output.log(`Configuration: ${loaded.path}`);
         if (loaded.hasLocalOverrides && loaded.localPath) {
            this.output.log(`Local overrides: ${loaded.localPath}`);
         }
         this.output.log('');
         this.output.log('Use --resolved to see the full merged configuration.');
      }
   }
}
