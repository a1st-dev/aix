import { Command, Help } from '@oclif/core';

export default class AddIndex extends Command {
   static override description = 'Add skills, MCP servers, agents, rules, prompts, or hooks to ai.json';

   static override hidden = true;

   async run(): Promise<void> {
      const help = new Help(this.config);

      await help.showHelp(['add']);
   }
}
