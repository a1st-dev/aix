import { BaseCommand } from '../../base-command.js';

type PluginRow = Record<string, unknown> & {
   name: string;
   status: string;
   reference: string;
};

export default class ListPlugins extends BaseCommand<typeof ListPlugins> {
   static override description = 'List configured plugins';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const plugins = loaded.config.plugins ?? {};

      if (this.flags.json) {
         this.output.json({ plugins });
         return;
      }

      const entries = Object.entries(plugins);

      if (entries.length === 0) {
         this.output.info('No plugins configured');
         return;
      }

      const rows: PluginRow[] = entries.map(([name, val]) => {
         let status = 'enabled',
             reference = '-';

         if (val === false) {
            status = 'disabled';
         } else if (typeof val === 'boolean') {
            status = val ? 'enabled' : 'disabled';
         } else if (typeof val === 'string') {
            reference = val;
         } else if (typeof val === 'object' && val !== null) {
            if (val.enabled === false) {
               status = 'disabled';
            }
            if (val.source) {
               reference = typeof val.source === 'string' ? val.source : JSON.stringify(val.source);
            } else if (val.marketplace) {
               reference = `@${val.marketplace}`;
            }
         }

         return {
            name,
            status,
            reference,
         };
      });

      this.output.header('Plugins');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'status', name: 'Status' },
            { key: 'reference', name: 'Reference' },
         ],
         overflow: 'wrap',
      });
   }
}
