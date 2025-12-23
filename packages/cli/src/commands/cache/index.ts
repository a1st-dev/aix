import { Command, Help } from '@oclif/core';

export default class CacheIndex extends Command {
   static override description = 'Clear cache and backups';

   static override hidden = true;

   async run(): Promise<void> {
      const help = new Help(this.config);

      await help.showHelp(['cache']);
   }
}
