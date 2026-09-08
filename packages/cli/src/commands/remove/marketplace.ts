import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath, type EditorName } from '@a1st/aix-core';
import { normalizeEditors, resolveScope } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd } from '../../lib/install-helper.js';

export default class RemoveMarketplace extends BaseCommand<typeof RemoveMarketplace> {
   static override description = 'Remove a marketplace catalog from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> my-market',
      '<%= config.bin %> <%= command.id %> team-plugins --yes',
      '<%= config.bin %> <%= command.id %> team-plugins --no-install',
   ];

   static override args = {
      name: Args.string({
         description: 'Marketplace name to remove',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      ...configScopeFlags,
      ...targetFlag,
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
      'no-install': Flags.boolean({
         description: 'Skip re-installing to editors after removing',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemoveMarketplace);
      const loaded = await this.loadConfig();
      const targetEditors = resolveTargetEditors(flags.target);
      const marketplaceName = args.name;
      const targetScope = resolveConfigScope(
         flags as { scope?: string; user?: boolean; project?: boolean },
         loaded && !flags.local ? resolveScope(loaded.config) : undefined,
      );

      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if marketplace exists in merged config (if we have one)
      if (loaded && !loaded.config.marketplaces?.[marketplaceName]) {
         this.error(`Marketplace "${marketplaceName}" not found in configuration`);
      }

      // Confirm removal
      if (!flags.yes) {
         const targetFile = flags.local ? 'ai.local.json' : 'ai.json',
               message = `Remove marketplace "${marketplaceName}" from ${targetFile}?`;

         const confirmed = await confirm({
            message,
            default: false,
         });

         if (!confirmed) {
            this.output.info('Cancelled');
            return;
         }
      }

      // Update ai.json / ai.local.json if present
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [marketplaceName]: _, ...remainingMarketplaces } = config.marketplaces ?? {};

            return {
               ...config,
               marketplaces: remainingMarketplaces,
            };
         });
         this.output.success(`Removed marketplace "${marketplaceName}" from ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [marketplaceName]: _, ...remainingMarketplaces } = config.marketplaces ?? {};

            return {
               ...config,
               marketplaces: remainingMarketplaces,
            };
         });
         this.output.success(`Removed marketplace "${marketplaceName}"`);
      }

      // Re-install remaining config to editors unless skipped
      if (!flags['no-install'] && loaded) {
         const configuredEditors = loaded.config.editors,
               editors = targetEditors ?? (configuredEditors
                  ? (Object.keys(normalizeEditors(configuredEditors)) as EditorName[])
                  : undefined);

         await installAfterAdd({
            configPath: loaded.path,
            sections: ['marketplaces'],
            scope: targetScope,
            quiet: true,
            editors,
         });
      }

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'marketplace',
            name: marketplaceName,
         });
      }
   }
}
