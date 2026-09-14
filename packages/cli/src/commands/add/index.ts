import { Command, Help } from '@oclif/core';

export default class AddIndex extends Command {
   static override description =
      'Install skills, MCP servers, agents, rules, prompts, hooks, plugins, or marketplaces';

   static override hidden = true;
   static override strict = false;

   async run(): Promise<void> {
      await this.parse();
      const help = new Help(this.config);

      await help.showHelp(['add']);
   }
}
