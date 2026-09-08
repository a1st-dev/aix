import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig } from '@a1st/aix-core';
import {
   pluginNameSchema,
   pluginValueSchema,
   type PluginValue,
} from '@a1st/aix-schema';
import {
   getAddSources,
   installAddedItem,
   isUserScopeAdd,
   persistAddedItem,
   rejectMultiSourceFlags,
   rejectUserScopeProjectConfigFlags,
   resolveAddTargetScope,
   refreshLockfileAfterAdd,
} from '../../lib/add-command-helper.js';

export default class AddPlugin extends BaseCommand<typeof AddPlugin> {
   static override description = 'Add a plugin to ai.json';
   static override strict = false;

   static override examples = [
      '<%= config.bin %> <%= command.id %> code-review',
      '<%= config.bin %> <%= command.id %> code-review@claude-plugins-official',
      '<%= config.bin %> <%= command.id %> @scope/my-plugin',
      '<%= config.bin %> <%= command.id %> code-review --marketplace custom-market',
      '<%= config.bin %> <%= command.id %> ./plugins/local-plugin --name my-plugin',
      '<%= config.bin %> <%= command.id %> code-review --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Plugin name (e.g. "code-review", "code-review@marketplace", "@scope/pkg", or local path)',
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
         description: 'Override plugin name',
      }),
      marketplace: Flags.string({
         char: 'm',
         description: 'Marketplace name where plugin is published',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags, argv } = await this.parse(AddPlugin),
            userScopeAdd = isUserScopeAdd(flags),
            loaded = userScopeAdd ? undefined : await this.loadConfig(),
            targetScope = resolveAddTargetScope(flags, loaded),
            lockableConfigPath = getLockableConfigPath(loaded),
            sources = getAddSources(args, argv),
            targetEditors = resolveTargetEditors(flags.target);

      rejectUserScopeProjectConfigFlags({
         flags,
         error: this.error.bind(this),
      });
      if (flags.lock && !lockableConfigPath) {
         this.error('--lock requires a local ai.json. Run `aix init` first, or omit --lock.');
      }
      validateTargetEditors(targetEditors, this.error.bind(this));
      rejectMultiSourceFlags({
         sources,
         flags,
         disallowedFlags: ['name', 'marketplace'],
         error: this.error.bind(this),
      });

      const addedItems = await sources.reduce<Promise<Array<{ name: string; value: PluginValue }>>>(
         async (memoPromise, source) => {
            const memo = await memoPromise,
                  parsed = this.parsePluginInput(source, flags.name, flags.marketplace);

            await persistAddedItem({
               loaded,
               local: flags.local,
               output: this.output,
               directInstallMessage: userScopeAdd
                  ? 'User-scope add: installing directly to editors without reading project ai.json'
                  : undefined,
               localSuccessMessage: `Added plugin "${parsed.name}" to ai.local.json`,
               projectSuccessMessage: `Added plugin "${parsed.name}"`,
               saveLocal: async (localPath) => {
                  await updateLocalConfig(localPath, (config) => ({
                     ...config,
                     plugins: {
                        ...config.plugins,
                        [parsed.name]: parsed.value,
                     },
                  }));
               },
               saveProject: async (configPath) => {
                  await updateConfig(configPath, (config) => ({
                     ...config,
                     plugins: {
                        ...config.plugins,
                        [parsed.name]: parsed.value,
                     },
                  }));
               },
            });

            memo.push({ name: parsed.name, value: parsed.value });

            if (!loaded || flags.local) {
               await installAddedItem({
                  logInstallResults: (results) => {
                     this.logInstallResults(results);
                  },
                  skipInstall: flags['no-install'],
                  loaded,
                  local: flags.local,
                  installSections: ['plugins'],
                  itemSection: 'plugins',
                  itemName: parsed.name,
                  itemValue: parsed.value,
                  scope: targetScope,
                  projectRoot: process.cwd(),
                  editors: targetEditors,
                  failInstall: this.error.bind(this),
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
            installSections: ['plugins'],
            itemSection: 'plugins',
            itemName: firstItem.name,
            itemValue: firstItem.value,
            scope: targetScope,
            projectRoot: process.cwd(),
            editors: targetEditors,
            failInstall: this.error.bind(this),
         });
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'plugin',
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

   private parsePluginInput(
      source: string,
      nameOverride?: string,
      marketplaceFlag?: string,
   ): { name: string; value: PluginValue } {
      let pluginName = nameOverride ?? source,
          pluginValue: PluginValue = true;

      // Check if source is a local path
      if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
         if (!nameOverride) {
            const parts = source.replace(/\/+$/, '').split('/'),
                  lastPart = parts[parts.length - 1];

            pluginName = lastPart ?? 'plugin';
         }
         pluginValue = {
            source,
            enabled: true,
            ...(marketplaceFlag ? { marketplace: marketplaceFlag } : {}),
         };
      } else if (marketplaceFlag) {
         pluginName = nameOverride ?? source;
         pluginValue = {
            marketplace: marketplaceFlag,
            enabled: true,
         };
      }

      // Validate plugin name
      const nameValidation = pluginNameSchema.safeParse(pluginName);

      if (!nameValidation.success) {
         this.error(
            `Invalid plugin name "${pluginName}". ` +
            'Must be a valid identifier (e.g., "code-review", "code-review@marketplace", "@scope/pkg").',
         );
      }

      // Validate plugin value
      const valueValidation = pluginValueSchema.safeParse(pluginValue);

      if (!valueValidation.success) {
         this.error(`Invalid plugin configuration: ${valueValidation.error.message}`);
      }

      return {
         name: pluginName,
         value: pluginValue,
      };
   }
}
