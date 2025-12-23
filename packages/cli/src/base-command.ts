import { Command, Flags, Interfaces } from '@oclif/core';
import chalk from 'chalk';
import { basename } from 'pathe';
import { loadConfig as coreLoadConfig, ConfigParseError, type LoadedConfig } from '@a1st/aix-core';
import { Output } from './lib/output.js';

export type InferredFlags<T extends typeof Command> = Interfaces.InferredFlags<
   (typeof BaseCommand)['baseFlags'] & T['flags']
>;

export abstract class BaseCommand<T extends typeof Command> extends Command {
   static baseFlags = {
      config: Flags.string({
         char: 'c',
         description: 'Path to ai.json config file',
         env: 'AI_JSON_CONFIG',
      }),
      quiet: Flags.boolean({
         char: 'q',
         description: 'Suppress non-essential output',
         default: false,
      }),
      json: Flags.boolean({
         description: 'Output as JSON',
         default: false,
      }),
   };

   protected flags!: InferredFlags<T>;
   protected output!: Output;
   protected loadedConfig?: LoadedConfig;

   public async init(): Promise<void> {
      await super.init();
      const { flags } = await this.parse({
         flags: this.ctor.flags,
         baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
         args: this.ctor.args,
         strict: this.ctor.strict,
      });

      this.flags = flags as InferredFlags<T>;
      this.output = new Output({
         quiet: this.flags.quiet,
         json: this.flags.json,
      });
   }

   protected async loadConfig(): Promise<LoadedConfig | undefined> {
      if (this.loadedConfig) {
         return this.loadedConfig;
      }

      const result = await coreLoadConfig(this.flags.config);

      if (result) {
         this.loadedConfig = result;
         // Log when local overrides are applied
         if (result.hasLocalOverrides && result.localPath) {
            this.output.info(`Using local overrides from ${result.localPath}`);
         }
      }
      return this.loadedConfig;
   }

   protected async requireConfig(): Promise<LoadedConfig> {
      const config = await this.loadConfig();

      if (!config) {
         this.error('No ai.json found. Run `aix init` to create one.');
      }
      return config;
   }

   /** Log formatted install results */
   protected logInstallResults(results: Array<{ message: string; success: boolean }>): void {
      for (const r of results) {
         if (r.success) {
            this.output.info(r.message);
         } else {
            this.output.warn(r.message);
         }
      }
   }

   /** Log delete operation results */
   protected logDeleteResults(
      results: Array<{ editor: string; deleted: string[]; errors: string[] }>,
   ): void {
      for (const result of results) {
         if (result.deleted.length > 0) {
            this.output.info(`Deleted ${result.deleted.length} file(s) from ${result.editor}`);
         }
         for (const err of result.errors) {
            this.output.warn(`Failed to delete: ${err}`);
         }
      }
   }

   protected async catch(error: Error & { exitCode?: number }): Promise<void> {
      // Handle ConfigParseError with human-readable formatting (unless --json)
      if (error instanceof ConfigParseError && error.issues && !this.flags?.json) {
         this.displayConfigParseError(error);
         this.exit(1);
      }

      // Let oclif handle other errors
      return super.catch(error);
   }

   /**
    * Display a ConfigParseError in human-readable format.
    *
    * Format:
    * ```
    * ✗ Configuration Error
    *
    *   File: ai.local.json
    *
    *   ● mcp.playwright
    *     Expected object or false, received true
    *
    *   Found 2 validation errors.
    * ```
    */
   protected displayConfigParseError(error: ConfigParseError): void {
      const fileName = basename(error.filePath),
            issues = error.issues ?? [];

      console.error('');
      console.error(chalk.red('✗') + ' Configuration ' + chalk.red('Error'));
      console.error('');
      console.error('  File: ' + chalk.cyan(fileName));
      console.error('');

      for (const issue of issues) {
         console.error('  ' + chalk.yellow('●') + ' ' + chalk.yellow(issue.path));
         console.error('    ' + issue.message);
         console.error('');
      }

      if (issues.length > 1) {
         console.error(chalk.dim(`  Found ${issues.length} validation errors.`));
      } else if (issues.length === 1) {
         // Add a hint for single errors about object/false types
         const firstIssue = issues[0];

         if (firstIssue && firstIssue.message.includes('object or false')) {
            console.error(
               chalk.dim('  Hint: Set to false to disable, or use { "command": "..." } to configure.'),
            );
         }
      }
   }
}
