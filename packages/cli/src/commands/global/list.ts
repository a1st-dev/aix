import { GlobalTrackingService } from '@a1st/aix-core';
import { BaseCommand } from '../../base-command.js';

type GlobalRow = {
   key: string;
   editor: string;
   type: string;
   name: string;
   projects: number;
};

export default class GlobalList extends BaseCommand<typeof GlobalList> {
   static override description = 'List globally tracked configurations';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const tracking = new GlobalTrackingService(),
            data = await tracking.load();

      if (this.flags.json) {
         this.output.json(data);
         return;
      }

      const entries = Object.entries(data.entries);

      if (entries.length === 0) {
         this.output.info('No global configurations tracked');
         this.output.info('Global configs are tracked when installing to editors with global-only features (Windsurf MCP, Codex MCP/Prompts)');
         return;
      }

      const rows: GlobalRow[] = entries.map(([key, entry]) => ({
         key,
         editor: entry.editor,
         type: entry.type,
         name: entry.name,
         projects: entry.projects.length,
      }));

      this.output.header('Global Configurations');
      this.output.table(rows, {
         columns: [
            { key: 'editor', name: 'Editor' },
            { key: 'type', name: 'Type' },
            { key: 'name', name: 'Name' },
            { key: 'projects', name: 'Projects' },
         ],
      });

      this.output.info('\nTracking file: ~/.aix/global-tracking.json');
   }
}
