import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, installSingleItem, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import {
   getLocalConfigPath,
   loadRule,
   parseSourceReference,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { RuleValue } from '@a1st/aix-schema';

type ActivationMode = 'always' | 'auto' | 'glob' | 'manual';

export default class AddRule extends BaseCommand<typeof AddRule> {
   static override description = 'Add a rule to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> "Always use TypeScript for new files" --name typescript-rule',
      '<%= config.bin %> <%= command.id %> ./rules/coding-standards.md --name coding-standards',
      '<%= config.bin %> <%= command.id %> https://github.com/anthropics/skills/tree/main/skills/frontend-design --name frontend',
      '<%= config.bin %> <%= command.id %> github:myorg/rules/typescript#main --name typescript',
      '<%= config.bin %> <%= command.id %> "Always use TypeScript" --name ts-rule --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Rule content, local file path, or git URL',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      ...configScopeFlags,
      name: Flags.string({
         char: 'n',
         description: 'Rule name (inferred from source if not provided)',
      }),
      description: Flags.string({
         char: 'd',
         description: 'When the rule should apply (enables auto activation)',
      }),
      activation: Flags.string({
         char: 'a',
         description: 'Activation mode',
         options: ['always', 'auto', 'glob', 'manual'],
         default: 'always',
      }),
      globs: Flags.string({
         char: 'g',
         description: 'File patterns for glob activation (comma-separated)',
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
      const { args, flags } = await this.parse(AddRule),
            loaded = await this.loadConfig(),
            targetScope = resolveConfigScope(flags as { scope?: string; user?: boolean; project?: boolean }),
            parsed = parseSourceReference(args.source, { type: 'rule', refOverride: flags.ref }),
            ruleName = flags.name ?? parsed.inferredName;

      if (!ruleName) {
         this.error('Could not infer rule name from source. Please provide --name.');
      }

      // Build the rule value
      let ruleValue: RuleValue = parsed.value as RuleValue;

      // Add metadata if provided (convert string shorthand to object if needed)
      if (flags.description || flags.activation !== 'always' || flags.globs) {
         if (typeof ruleValue === 'string') {
            // Convert string shorthand to object form
            ruleValue = { path: ruleValue };
         }
         ruleValue = { ...ruleValue, ...this.buildMetadata(flags) };
      }

      // Validate the source is accessible BEFORE updating ai.json
      // This prevents adding broken references to the config
      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      try {
         await loadRule(ruleName, ruleValue, basePath);
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Failed to load rule: ${message}`);
      }

      // Update ai.json / ai.local.json if present
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            return {
               ...config,
               rules: { ...config.rules, [ruleName]: ruleValue },
            };
         });
         this.output.success(`Added rule "${ruleName}" to ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            return {
               ...config,
               rules: { ...config.rules, [ruleName]: ruleValue },
            };
         });
         this.output.success(`Added rule "${ruleName}"`);
      } else {
         this.output.info('No ai.json found — installing directly to editors');
      }

      // Install to editors unless --no-install
      if (!flags['no-install']) {
         if (loaded && !flags.local) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               sections: ['rules'],
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         } else {
            const installResult = await installSingleItem({
               section: 'rules',
               name: ruleName,
               value: ruleValue,
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
            type: 'rule',
            name: ruleName,
            value: ruleValue,
         });
      }
   }

   private buildMetadata(flags: {
      description?: string;
      activation?: string;
      globs?: string;
   }): Partial<{ description: string; activation: ActivationMode; globs: string[] }> {
      const metadata: Partial<{
         description: string;
         activation: ActivationMode;
         globs: string[];
      }> = {};

      if (flags.description) {
         metadata.description = flags.description;
      }
      if (flags.activation && flags.activation !== 'always') {
         metadata.activation = flags.activation as ActivationMode;
      }
      if (flags.globs) {
         metadata.globs = flags.globs.split(',').map((g) => g.trim());
      }

      return metadata;
   }
}
