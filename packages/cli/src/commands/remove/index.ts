import { Command, Help } from '@oclif/core';

export default class RemoveIndex extends Command {
   static override description = 'Remove skills, MCP servers, or rules from ai.json';

   static override hidden = true;

   async run(): Promise<void> {
      const help = new Help(this.config);

      await help.showHelp(['remove']);
   }
}
