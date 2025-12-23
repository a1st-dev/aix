import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { printTable, type TableOptions } from '@oclif/table';

export interface OutputOptions {
   quiet: boolean;
   json: boolean;
}

export class Output {
   private quiet: boolean;
   private jsonMode: boolean;
   private spinner?: Ora;

   constructor(options: OutputOptions) {
      this.quiet = options.quiet;
      this.jsonMode = options.json;
   }

   log(message: string): void {
      if (!this.quiet && !this.jsonMode) {
         console.log(message);
      }
   }

   success(message: string): void {
      this.log(chalk.green('✓') + ' ' + message);
   }

   warn(message: string): void {
      if (!this.jsonMode) {
         console.warn(chalk.yellow('⚠') + ' ' + message);
      }
   }

   error(message: string): void {
      if (!this.jsonMode) {
         console.error(chalk.red('✗') + ' ' + message);
      }
   }

   info(message: string): void {
      this.log(chalk.blue('ℹ') + ' ' + message);
   }

   startSpinner(message: string): void {
      if (!this.quiet && !this.jsonMode) {
         this.spinner = ora(message).start();
      }
   }

   stopSpinner(success = true, message?: string): void {
      if (this.spinner) {
         if (success) {
            this.spinner.succeed(message);
         } else {
            this.spinner.fail(message);
         }
         this.spinner = undefined;
      }
   }

   json(data: unknown): void {
      if (this.jsonMode) {
         console.log(JSON.stringify(data, null, 2));
      }
   }

   table<T extends Record<string, unknown>>(data: T[], options: Omit<TableOptions<T>, 'data'>): void {
      if (!this.quiet && !this.jsonMode && data.length > 0) {
         printTable({ ...options, data });
      }
   }

   header(text: string): void {
      if (!this.quiet && !this.jsonMode) {
         console.log(chalk.bold.cyan(`\n${text}`));
      }
   }

   dim(text: string): string {
      return chalk.dim(text);
   }

   cyan(text: string): string {
      return chalk.cyan(text);
   }

   green(text: string): string {
      return chalk.green(text);
   }

   red(text: string): string {
      return chalk.red(text);
   }
}
