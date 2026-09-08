import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig } from '@a1st/aix-core';
import {
   marketplaceNameSchema,
   marketplaceValueSchema,
   type MarketplaceValue,
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

export default class AddMarketplace extends BaseCommand<typeof AddMarketplace> {
   static override description = 'Add a marketplace catalog to ai.json';
   static override strict = false;

   static override examples = [
      '<%= config.bin %> <%= command.id %> https://github.com/my-org/marketplace-catalog --name my-market',
      '<%= config.bin %> <%= command.id %> github:my-org/plugins --name team-plugins',
      '<%= config.bin %> <%= command.id %> ./marketplaces/local --name local-market',
      '<%= config.bin %> <%= command.id %> github:my-org/plugins --name team-plugins --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Marketplace source: git URL, git shorthand, or local directory path',
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
         description: 'Marketplace name (inferred from source if not provided)',
      }),
      description: Flags.string({
         char: 'd',
         description: 'Optional description of the marketplace',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags, argv } = await this.parse(AddMarketplace),
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
         disallowedFlags: ['name', 'description'],
         error: this.error.bind(this),
      });

      const addedItems = await sources.reduce<Promise<Array<{ name: string; value: MarketplaceValue }>>>(
         async (memoPromise, source) => {
            const memo = await memoPromise,
                  parsed = this.parseMarketplaceInput(source, flags.name, flags.description);

            await persistAddedItem({
               loaded,
               local: flags.local,
               output: this.output,
               directInstallMessage: userScopeAdd
                  ? 'User-scope add: installing directly to editors without reading project ai.json'
                  : undefined,
               localSuccessMessage: `Added marketplace "${parsed.name}" to ai.local.json`,
               projectSuccessMessage: `Added marketplace "${parsed.name}"`,
               saveLocal: async (localPath) => {
                  await updateLocalConfig(localPath, (config) => ({
                     ...config,
                     marketplaces: {
                        ...config.marketplaces,
                        [parsed.name]: parsed.value,
                     },
                  }));
               },
               saveProject: async (configPath) => {
                  await updateConfig(configPath, (config) => ({
                     ...config,
                     marketplaces: {
                        ...config.marketplaces,
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
                  installSections: ['marketplaces'],
                  itemSection: 'marketplaces',
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
            installSections: ['marketplaces'],
            itemSection: 'marketplaces',
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
            type: 'marketplace',
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

   private parseMarketplaceInput(
      source: string,
      nameOverride?: string,
      description?: string,
   ): { name: string; value: MarketplaceValue } {
      let inferredName = nameOverride;

      if (!inferredName) {
         const cleanSource = source.replace(/\.git$/, '').replace(/\/+$/, ''),
               parts = cleanSource.split('/'),
               lastPart = parts[parts.length - 1];

         inferredName = (lastPart ?? 'marketplace')
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
      }

      const nameValidation = marketplaceNameSchema.safeParse(inferredName);

      if (!nameValidation.success) {
         this.error(
            `Invalid marketplace name "${inferredName}". ` +
            'Must be lowercase alphanumeric with single hyphens (e.g. "team-plugins"). ' +
            'Use --name to specify a valid name.',
         );
      }

      let marketplaceValue: MarketplaceValue;

      if (description) {
         marketplaceValue = {
            source,
            enabled: true,
            description,
         };
      } else {
         marketplaceValue = source;
      }

      const valueValidation = marketplaceValueSchema.safeParse(marketplaceValue);

      if (!valueValidation.success) {
         this.error(`Invalid marketplace configuration: ${valueValidation.error.message}`);
      }

      return {
         name: inferredName,
         value: marketplaceValue,
      };
   }
}
