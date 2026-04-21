import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, installSingleItem, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import {
   getLocalConfigPath,
   loadPrompt,
   parseSourceReference,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { PromptValue } from '@a1st/aix-schema';

export default class AddPrompt extends BaseCommand<typeof AddPrompt> {
   static override description = 'Add a prompt/command to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> ./prompts/review.md --name review',
      '<%= config.bin %> <%= command.id %> https://github.com/org/prompts/blob/main/review.md --name review',
      '<%= config.bin %> <%= command.id %> "Review code for issues" --name review',
      '<%= config.bin %> <%= command.id %> github:myorg/prompts/code-review.md#main --name code-review',
      '<%= config.bin %> <%= command.id %> ./review.md --name review -d "Code review checklist" -a "[file]"',
      '<%= config.bin %> <%= command.id %> ./review.md --name review --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Prompt content, local file path, or git URL',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      ...configScopeFlags,
      name: Flags.string({
         char: 'n',
         description: 'Prompt name (inferred from source if not provided)',
      }),
      description: Flags.string({
         char: 'd',
         description: 'Description shown in command picker',
      }),
      'argument-hint': Flags.string({
         char: 'a',
         description: 'Hint for arguments (e.g., "[file] [message]")',
      }),
      ref: Flags.string({
         char: 'r',
         description: 'Git ref (branch, tag, commit) - overrides ref in URL',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(AddPrompt),
            loaded = await this.loadConfig(),
            targetScope = resolveConfigScope(flags as { scope?: string; user?: boolean; project?: boolean }),
            parsed = parseSourceReference(args.source, { type: 'prompt', refOverride: flags.ref }),
            promptName = flags.name ?? parsed.inferredName;

      if (!promptName) {
         this.error('Could not infer prompt name from source. Please provide --name.');
      }

      // Build the prompt value
      let promptValue: PromptValue = parsed.value as PromptValue;

      // Add metadata if provided (convert string shorthand to object if needed)
      if (flags.description || flags['argument-hint']) {
         if (typeof promptValue === 'string') {
            // Convert string shorthand to object form
            promptValue = { path: promptValue };
         }
         if (flags.description) {
            promptValue = { ...promptValue, description: flags.description };
         }
         if (flags['argument-hint']) {
            promptValue = { ...promptValue, argumentHint: flags['argument-hint'] };
         }
      }

      // Validate the source is accessible BEFORE updating ai.json
      // This prevents adding broken references to the config
      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      try {
         await loadPrompt(promptName, promptValue, basePath);
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Failed to load prompt: ${message}`);
      }

      // Update ai.json / ai.local.json if present
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            return {
               ...config,
               prompts: { ...config.prompts, [promptName]: promptValue },
            };
         });
         this.output.success(`Added prompt "${promptName}" to ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            return {
               ...config,
               prompts: { ...config.prompts, [promptName]: promptValue },
            };
         });
         this.output.success(`Added prompt "${promptName}"`);
      } else {
         this.output.info('No ai.json found — installing directly to editors');
      }

      // Install to editors unless --no-install
      if (!flags['no-install']) {
         if (loaded && !flags.local) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               sections: ['editors'], // prompts are under editors scope
               scope: targetScope,
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         } else {
            const installResult = await installSingleItem({
               section: 'prompts',
               name: promptName,
               value: promptValue,
               scope: targetScope,
               projectRoot: process.cwd(),
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'prompt',
            name: promptName,
            value: promptValue,
         });
      }
   }
}
