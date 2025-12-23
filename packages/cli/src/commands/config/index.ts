import { Command, Help } from '@oclif/core';

export default class ConfigIndex extends Command {
   static override description = 'Manage aix configuration';

   static override hidden = true;

   async run(): Promise<void> {
      const help = new Help(this.config);

      await help.showHelp(['config']);
   }
}
