import { BaseCommand } from '../../base-command.js';
import type { AgentObject } from '@a1st/aix-schema';

type AgentRow = Record<string, unknown> & {
   name: string;
   mode: string;
   model: string;
   reference: string;
};

export default class ListAgents extends BaseCommand<typeof ListAgents> {
   static override description = 'List configured agents';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const agents = loaded.config.agents ?? {};

      if (this.flags.json) {
         this.output.json({ agents });
         return;
      }

      const entries = Object.entries(agents);

      if (entries.length === 0) {
         this.output.info('No agents configured');
         return;
      }

      const rows: AgentRow[] = entries.map(([name, val]) => {
         let mode = 'subagent',
             model = '-',
             reference = '';

         if (typeof val === 'string') {
            reference = val;
         } else if (typeof val === 'object' && val !== null) {
            const obj = val as AgentObject;

            mode = obj.mode ?? 'subagent';
            model = obj.model ?? '-';
            if (obj.path) {
               reference = obj.path;
            } else if (obj.git) {
               reference = obj.git.url;
            } else if (obj.npm) {
               reference = obj.npm.npm;
            } else if (obj.content) {
               reference = '(inline content)';
            } else {
               reference = JSON.stringify(val);
            }
         }

         return {
            name,
            mode,
            model,
            reference,
         };
      });

      this.output.header('Agents');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'mode', name: 'Mode' },
            { key: 'model', name: 'Model' },
            { key: 'reference', name: 'Reference' },
         ],
         overflow: 'wrap',
      });
   }
}
