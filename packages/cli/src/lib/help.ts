import { Command, Help, Interfaces } from '@oclif/core';

export default class CustomHelp extends Help {
   /** oclif stores ids with colons. Show them the way they are typed. */
   private formatCommandId(id: string): string {
      return id.replaceAll(':', this.config.topicSeparator);
   }

   protected formatTopics(topics: Interfaces.Topic[]): string {
      if (topics.length === 0) {
         return '';
      }

      const body = this.renderList(
         topics.map((c) => {
            return [this.formatCommandId(c.name), c.description ? `${c.description.split('\n')[0]}` : ''];
         }),
         { indentation: 2, spacer: '\n', stripAnsi: this.opts.stripAnsi },
      );

      return this.section('TOPIC GROUPS (use "aix <topic>" for subcommands)', body);
   }
   // Public because newer @oclif/core releases declare it public on Help, and a subclass may
   // widen a protected member but not narrow a public one. This compiles against both.
   public formatRoot(): string {
      return `aix - Unified AI agent and editor configuration

${super.formatRoot()}`;
   }

   protected formatCommands(commands: Command.Loadable[]): string {
      // Build a map of command ID to its aliases
      const aliasMap = new Map<string, string[]>();

      for (const cmd of commands) {
         if (cmd.aliases && cmd.aliases.length > 0) {
            aliasMap.set(cmd.id, cmd.aliases);
         }
      }

      // Filter out commands that are aliases of other commands
      const aliasIds = new Set(commands.flatMap((cmd) => cmd.aliases ?? []));
      const filteredCommands = commands.filter((cmd) => !aliasIds.has(cmd.id));

      // Format each command with its aliases inline
      const body = this.renderList(
         filteredCommands.map((cmd) => {
            const aliases = aliasMap.get(cmd.id);
            const aliasText = aliases && aliases.length > 0 ? ` (alias: ${aliases.map(this.formatCommandId, this).join(', ')})` : '';
            const summary = this.summary(cmd);

            return [this.formatCommandId(cmd.id), summary ? `${summary}${aliasText}` : aliasText];
         }),
         { indentation: 2, spacer: '\n', stripAnsi: this.opts.stripAnsi },
      );

      return this.section('COMMANDS', body);
   }
}
