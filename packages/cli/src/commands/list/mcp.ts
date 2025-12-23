import { getTransport } from '@a1st/aix-core';
import { BaseCommand } from '../../base-command.js';

type McpRow = Record<string, unknown> & {
   name: string;
   transport: string;
   command: string;
   status: string;
};

export default class ListMcp extends BaseCommand<typeof ListMcp> {
   static override aliases = ['list:mcps'];

   static override description = 'List configured MCP servers';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const mcp = loaded.config.mcp ?? {};

      if (this.flags.json) {
         this.output.json({ mcp });
         return;
      }

      // Filter out false values (disabled servers)
      const entries = Object.entries(mcp).filter(([, config]) => config !== false);

      if (entries.length === 0) {
         this.output.info('No MCP servers configured');
         return;
      }

      const rows: McpRow[] = entries.map(([name, config]) => {
         // Type assertion safe because we filtered out false above
         const serverConfig = config as Exclude<typeof config, false>,
               transport = getTransport(serverConfig),
               type = transport.type,
               command = type === 'stdio' ? transport.command : transport.url;

         return {
            name,
            transport: type,
            command,
            status: serverConfig.enabled === false ? 'disabled' : 'enabled',
         };
      });

      this.output.header('MCP Servers');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'transport', name: 'Transport' },
            { key: 'command', name: 'Command/URL' },
            { key: 'status', name: 'Status' },
         ],
         overflow: 'wrap',
      });
   }
}
