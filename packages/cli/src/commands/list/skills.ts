import { BaseCommand } from '../../base-command.js';

type SkillRow = Record<string, unknown> & {
   name: string;
   reference: string;
};

export default class ListSkills extends BaseCommand<typeof ListSkills> {
   static override description = 'List configured skills';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const skills = loaded.config.skills ?? {};

      if (this.flags.json) {
         this.output.json({ skills });
         return;
      }

      const entries = Object.entries(skills);

      if (entries.length === 0) {
         this.output.info('No skills configured');
         return;
      }

      const rows: SkillRow[] = entries.map(([name, ref]) => ({
         name,
         reference: typeof ref === 'string' ? ref : JSON.stringify(ref, null, 2),
      }));

      this.output.header('Skills');
      this.output.table(rows, {
         columns: [
            { key: 'name', name: 'Name' },
            { key: 'reference', name: 'Reference' },
         ],
         overflow: 'wrap',
      });
   }
}
