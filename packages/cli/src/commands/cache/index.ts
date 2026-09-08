import { Command, Help } from '@oclif/core';

export default class CacheIndex extends Command {
   static override description = 'Clear cache and backups';

   static override hidden = true;
   static override strict = false;

   async run(): Promise<void> {
      await this.parse();
      const help = new Help(this.config);

      await help.showHelp(['cache']);
   }
}
