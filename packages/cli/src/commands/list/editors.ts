import { BaseCommand } from '../../base-command.js';

type EditorRow = Record<string, unknown> & {
   name: string;
   status: string;
   rules: string;
};

export default class ListEditors extends BaseCommand<typeof ListEditors> {
   static override description = 'List configured editors';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const editors = loaded.config.editors ?? {};

      if (this.flags.json) {
         this.output.json({ editors });
         return;
      }

      const entries = Object.entries(editors);

      if (entries.length === 0) {
         this.output.info('No editor-specific configuration');
         return;
      }

      const rows: EditorRow[] = entries.map(([name, config]) => ({
         name,
         status: config.enabled === false ? 'disabled' : 'enabled',
         rules: config.rules?.length ? `${config.rules.length} rule(s)` : '-',
      }));

      this.output.header('Editors');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'status', name: 'Status' },
            { key: 'rules', name: 'Rules' },
         ],
         overflow: 'wrap',
      });
   }
}
