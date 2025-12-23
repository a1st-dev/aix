import { Args } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { updateConfig } from '@a1st/aix-core';

export default class ConfigSet extends BaseCommand<typeof ConfigSet> {
   static override description = 'Set a configuration value';

   static override examples = [
      '<%= config.bin %> <%= command.id %> skills.typescript "^1.0.0"',
      '<%= config.bin %> <%= command.id %> rules \'["Use TypeScript"]\'',
   ];

   static override args = {
      key: Args.string({
         description: 'Configuration key (dot notation, e.g., "skills.typescript")',
         required: true,
      }),
      value: Args.string({
         description: 'Value to set (JSON for objects/arrays)',
         required: true,
      }),
   };

   async run(): Promise<void> {
      const { args } = await this.parse(ConfigSet);
      const loaded = await this.requireConfig();

      // Parse value as JSON if it looks like JSON, otherwise use as string
      let parsedValue: unknown;

      try {
         parsedValue = JSON.parse(args.value);
      } catch {
         parsedValue = args.value;
      }

      await updateConfig(loaded.path, (config) => {
         return this.setNestedValue(config, args.key, parsedValue);
      });

      this.output.success(`Set ${args.key}`);

      if (this.flags.json) {
         this.output.json({ key: args.key, value: parsedValue });
      }
   }

   private setNestedValue<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
      const parts = path.split('.');
      const result = { ...obj } as Record<string, unknown>;
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
         const part = parts[i]!;

         if (current[part] === undefined || current[part] === null) {
            current[part] = {};
         } else if (typeof current[part] === 'object') {
            current[part] = { ...(current[part] as Record<string, unknown>) };
         }
         current = current[part] as Record<string, unknown>;
      }

      const lastPart = parts[parts.length - 1]!;

      current[lastPart] = value;

      return result as T;
   }
}
