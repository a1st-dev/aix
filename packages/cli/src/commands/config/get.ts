import { Args } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';

export default class ConfigGet extends BaseCommand<typeof ConfigGet> {
   static override description = 'Get a configuration value';

   static override examples = [
      '<%= config.bin %> <%= command.id %> skills',
      '<%= config.bin %> <%= command.id %> mcp.github',
      '<%= config.bin %> <%= command.id %> rules',
   ];

   static override args = {
      key: Args.string({
         description: 'Configuration key (dot notation, e.g., "mcp.github")',
         required: true,
      }),
   };

   async run(): Promise<void> {
      const { args } = await this.parse(ConfigGet);
      const loaded = await this.requireConfig();

      const value = this.getNestedValue(loaded.config, args.key);

      if (value === undefined) {
         this.error(`Key "${args.key}" not found`);
      }

      if (this.flags.json) {
         this.output.json({ key: args.key, value });
         return;
      }

      if (typeof value === 'object') {
         this.output.log(JSON.stringify(value, null, 2));
      } else {
         this.output.log(String(value));
      }
   }

   private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
      const parts = path.split('.');
      let current: unknown = obj;

      for (const part of parts) {
         if (current === null || current === undefined) {
            return undefined;
         }
         if (typeof current !== 'object') {
            return undefined;
         }
         current = (current as Record<string, unknown>)[part];
      }

      return current;
   }
}
