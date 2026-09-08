import { Command, Help } from '@oclif/core';

export default class RemoveIndex extends Command {
   static override description =
      'Remove skills, MCP servers, agents, rules, prompts, hooks, plugins, or marketplaces from ai.json';

   static override hidden = true;
   static override strict = false;

   async run(): Promise<void> {
      await this.parse();
      const help = new Help(this.config);

      await help.showHelp(['remove']);
   }
}
