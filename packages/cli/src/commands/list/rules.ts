import { BaseCommand } from '../../base-command.js';

type RuleRow = Record<string, unknown> & {
   name: string;
   source: string;
   activation: string;
};

export default class ListRules extends BaseCommand<typeof ListRules> {
   static override description = 'List configured rules';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const rules = loaded.config.rules ?? {};

      if (this.flags.json) {
         this.output.json({ rules });
         return;
      }

      // Filter out false values (disabled rules)
      const entries = Object.entries(rules).filter(([, config]) => config !== false);

      if (entries.length === 0) {
         this.output.info('No rules configured');
         return;
      }

      const rows: RuleRow[] = entries.map(([name, config]) => {
         // Type assertion safe because we filtered out false above
         const ruleConfig = config as Exclude<typeof config, false>;
         let source: string,
             activation = 'always';

         if (typeof ruleConfig === 'string') {
            source = ruleConfig;
         } else {
            if (ruleConfig.path) {
               source = ruleConfig.path;
            } else if (ruleConfig.git) {
               source = `git:${ruleConfig.git.url}`;
            } else if (ruleConfig.npm) {
               source = `npm:${ruleConfig.npm.npm}`;
            } else if (ruleConfig.content) {
               source = '(inline)';
            } else {
               source = '(unknown)';
            }
            activation = ruleConfig.activation ?? 'always';
         }

         return { name, source, activation };
      });

      this.output.header('Rules');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'source', name: 'Source' },
            { key: 'activation', name: 'Activation' },
         ],
         overflow: 'wrap',
      });
   }
}
