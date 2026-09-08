import { BaseCommand } from '../../base-command.js';

type MarketplaceRow = Record<string, unknown> & {
   name: string;
   status: string;
   source: string;
   description: string;
};

export default class ListMarketplaces extends BaseCommand<typeof ListMarketplaces> {
   static override description = 'List configured marketplace catalogs';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const marketplaces = loaded.config.marketplaces ?? {};

      if (this.flags.json) {
         this.output.json({ marketplaces });
         return;
      }

      const entries = Object.entries(marketplaces);

      if (entries.length === 0) {
         this.output.info('No marketplaces configured');
         return;
      }

      const rows: MarketplaceRow[] = entries.map(([name, val]) => {
         let status = 'enabled',
             source = '-',
             description = '-';

         if (val === false) {
            status = 'disabled';
         } else if (typeof val === 'string') {
            source = val;
         } else if (typeof val === 'object' && val !== null) {
            if (val.enabled === false) {
               status = 'disabled';
            }
            if (val.source) {
               source = typeof val.source === 'string' ? val.source : JSON.stringify(val.source);
            }
            if (val.description) {
               description = val.description;
            }
         }

         return {
            name,
            status,
            source,
            description,
         };
      });

      this.output.header('Marketplaces');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'status', name: 'Status' },
            { key: 'source', name: 'Source' },
            { key: 'description', name: 'Description' },
         ],
         overflow: 'wrap',
      });
   }
}
