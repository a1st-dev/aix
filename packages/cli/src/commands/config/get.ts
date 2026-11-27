import { Args } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { CHECK_FOR_UPDATES_KEY, getCheckForUpdates } from '../../lib/update-settings.js';

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
      const { args } = await this.parse(ConfigGet),
            value = args.key === CHECK_FOR_UPDATES_KEY
               ? await getCheckForUpdates()
               : await this.getProjectConfigValue(args.key);

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

   private async getProjectConfigValue(key: string): Promise<unknown> {
      const { config } = await this.requireConfig(),
            value = this.getNestedValue(config, key);

      if (value === undefined && (key === 'cache' || key.startsWith('cache.'))) {
         return this.getNestedValue(config, `aix.${key}`);
      }

      return value;
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
