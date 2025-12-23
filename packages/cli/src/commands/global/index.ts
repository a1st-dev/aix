import { Command, Help } from '@oclif/core';

export default class GlobalIndex extends Command {
   static override description = 'Find and clean up orphaned global configurations';

   static override hidden = true;

   async run(): Promise<void> {
      const help = new Help(this.config);

      await help.showHelp(['global']);
   }
}
