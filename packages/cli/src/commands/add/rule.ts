import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   loadRule,
   parseSourceReference,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { RuleValue } from '@a1st/aix-schema';
import {
   getAddSources,
   installAddedItem,
   persistAddedItem,
   rejectMultiSourceFlags,
   refreshLockfileAfterAdd,
} from '../../lib/add-command-helper.js';

type ActivationMode = 'always' | 'auto' | 'glob' | 'manual';

export default class AddRule extends BaseCommand<typeof AddRule> {
   static override description = 'Add a rule to ai.json';
   static override strict = false;

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
      ...addLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...targetFlag,
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
      const { args, flags, argv } = await this.parse(AddRule),
            loaded = await this.loadConfig(),
            targetScope = resolveConfigScope(flags as { scope?: string; user?: boolean; project?: boolean }),
            lockableConfigPath = getLockableConfigPath(loaded),
            sources = getAddSources(args, argv),
            targetEditors = resolveTargetEditors(flags.target);

      if (flags.lock && !lockableConfigPath) {
         this.error('--lock requires a local ai.json. Run `aix init` first, or omit --lock.');
      }
      validateTargetEditors(targetEditors, this.error.bind(this));
      rejectMultiSourceFlags({
         sources,
         flags,
         disallowedFlags: ['name', 'description', 'ref'],
         error: this.error.bind(this),
      });

      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      const addedItems = await sources.reduce<Promise<Array<{ name: string; value: RuleValue }>>>(
         async (memoPromise, source) => {
            const memo = await memoPromise,
                  parsed = parseSourceReference(source, { type: 'rule', refOverride: flags.ref }),
                  ruleName = flags.name ?? parsed.inferredName;

            if (!ruleName) {
               this.error(`Could not infer rule name from source "${source}". Please provide --name.`);
            }

            let ruleValue: RuleValue = parsed.value as RuleValue;

            if (flags.description || flags.activation !== 'always' || flags.globs) {
               if (typeof ruleValue === 'string') {
                  ruleValue = { path: ruleValue };
               }
               ruleValue = { ...ruleValue, ...this.buildMetadata(flags) };
            }

            try {
               await loadRule(ruleName, ruleValue, basePath);
            } catch (error) {
               const message = error instanceof Error ? error.message : String(error);

               this.error(`Failed to load rule: ${message}`);
            }

            await persistAddedItem({
               loaded,
               local: flags.local,
               output: this.output,
               localSuccessMessage: `Added rule "${ruleName}" to ai.local.json`,
               projectSuccessMessage: `Added rule "${ruleName}"`,
               saveLocal: async (localPath) => {
                  await updateLocalConfig(localPath, (config) => {
                     return {
                        ...config,
                        rules: { ...config.rules, [ruleName]: ruleValue },
                     };
                  });
               },
               saveProject: async (configPath) => {
                  await updateConfig(configPath, (config) => {
                     return {
                        ...config,
                        rules: { ...config.rules, [ruleName]: ruleValue },
                     };
                  });
               },
            });

            memo.push({ name: ruleName, value: ruleValue });

            if (!loaded || flags.local) {
               await installAddedItem({
                  logInstallResults: (results) => {
                     this.logInstallResults(results);
                  },
                  skipInstall: flags['no-install'],
                  loaded,
                  local: flags.local,
                  installSections: ['rules'],
                  itemSection: 'rules',
                  itemName: ruleName,
                  itemValue: ruleValue,
                  scope: targetScope,
                  projectRoot: process.cwd(),
                  editors: targetEditors,
               });
            }

            return memo;
         }, Promise.resolve([]));

      const lockfilePath = await refreshLockfileAfterAdd(flags.lock, lockableConfigPath, this.output),
            firstItem = addedItems[0];

      if (loaded && !flags.local && firstItem) {
         await installAddedItem({
            logInstallResults: (results) => {
               this.logInstallResults(results);
            },
            skipInstall: flags['no-install'],
            loaded,
            local: flags.local,
            installSections: ['rules'],
            itemSection: 'rules',
            itemName: firstItem.name,
            itemValue: firstItem.value,
            scope: targetScope,
            projectRoot: process.cwd(),
            editors: targetEditors,
         });
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'rule',
            ...(addedItems.length === 1 && firstItem ? {
               name: firstItem.name,
               value: firstItem.value,
            } : {
               items: addedItems,
            }),
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
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
