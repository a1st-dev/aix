import { BaseCommand } from '../base-command.js';
import { loadConfig as coreLoadConfig } from '@a1st/aix-core';
import { ConfigValidationError } from '@a1st/aix-core';

export default class Validate extends BaseCommand<typeof Validate> {
   static override description = 'Validate ai.json configuration';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --config ./path/to/ai.json',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const configPath = this.flags.config;

      this.output.startSpinner('Validating configuration...');

      try {
         const result = await coreLoadConfig(configPath);

         if (!result) {
            this.output.stopSpinner(false, 'No ai.json found');
            if (this.flags.json) {
               this.output.json({ valid: false, error: 'No ai.json found' });
            }
            this.error('No ai.json found. Run `aix init` to create one.');
         }

         this.output.stopSpinner(true, 'Configuration is valid');

         if (this.flags.json) {
            this.output.json({
               valid: true,
               path: result.path,
               source: result.source,
               config: result.config,
            });
         }
      } catch (error) {
         this.output.stopSpinner(false, 'Configuration has errors');

         if (error instanceof ConfigValidationError) {
            for (const err of error.errors) {
               this.output.error(`${err.path}: ${err.message}`);
            }

            if (this.flags.json) {
               this.output.json({
                  valid: false,
                  errors: error.errors,
               });
            }

            this.exit(1);
         }

         if (error instanceof Error) {
            if (this.flags.json) {
               this.output.json({ valid: false, error: error.message });
            }
            this.error(error.message);
         }

         throw error;
      }
   }
}
