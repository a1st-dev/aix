import { BaseCommand } from '../../base-command.js';

type PromptRow = Record<string, unknown> & {
   name: string;
   source: string;
   description: string;
};

export default class ListPrompts extends BaseCommand<typeof ListPrompts> {
   static override description = 'List configured prompts';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const prompts = loaded.config.prompts ?? {};

      if (this.flags.json) {
         this.output.json({ prompts });
         return;
      }

      // Filter out false values (disabled prompts)
      const entries = Object.entries(prompts).filter(([, config]) => config !== false);

      if (entries.length === 0) {
         this.output.info('No prompts configured');
         return;
      }

      const rows: PromptRow[] = entries.map(([name, config]) => {
         const promptConfig = config as Exclude<typeof config, false>;
         let source: string,
             description = '';

         if (typeof promptConfig === 'string') {
            source = promptConfig;
         } else {
            if (promptConfig.path) {
               source = promptConfig.path;
            } else if (promptConfig.git) {
               source = `git:${promptConfig.git.url}`;
            } else if (promptConfig.npm) {
               source = `npm:${promptConfig.npm.npm}`;
            } else if (promptConfig.content) {
               source = '(inline)';
            } else {
               source = '(unknown)';
            }
            description = promptConfig.description ?? '';
         }

         return { name, source, description };
      });

      this.output.header('Prompts');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'source', name: 'Source' },
            { key: 'description', name: 'Description' },
         ],
         overflow: 'wrap',
      });
   }
}
