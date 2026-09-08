import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   updateConfig,
   updateLocalConfig,
   getLocalConfigPath,
   removeMarketplaceFromEditors,
   type EditorName,
} from '@a1st/aix-core';
import { resolveScope } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd } from '../../lib/install-helper.js';
import { getLockableConfigPath, refreshLockfileAfterRemoval } from '../../lib/lockfile-helper.js';
import { resolveRemovalEditors } from '../../lib/resolve-removal-editors.js';

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
      ...addLockFlag,
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

      const lockableConfigPath = getLockableConfigPath(flags.local, loaded?.path);

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

      const lockfilePath = await refreshLockfileAfterRemoval(flags.lock, lockableConfigPath, this.output);

      // Clean up marketplace config in editors unless skipped
      if (!flags['no-install']) {
         const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
               editors = await resolveRemovalEditors({
                  targetEditors,
                  section: 'marketplaces',
                  itemName: marketplaceName,
                  configuredEditors: flags.local ? undefined : loaded?.config.editors,
                  scope: targetScope,
                  projectRoot,
               });

         await this.removeMarketplaceFromEditorConfigs(editors, marketplaceName, projectRoot, targetScope);

         if (loaded) {
            await installAfterAdd({
               configPath: loaded.path,
               sections: ['marketplaces'],
               scope: targetScope,
               quiet: true,
               editors: targetEditors,
            });
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'marketplace',
            name: marketplaceName,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   private async removeMarketplaceFromEditorConfigs(
      editors: readonly EditorName[],
      name: string,
      projectRoot: string,
      targetScope: 'project' | 'user',
   ): Promise<void> {
      const results = await removeMarketplaceFromEditors(editors, name, projectRoot, { targetScope });

      for (const result of results) {
         if (!result.success) {
            this.output.error(`Failed to remove marketplace "${name}" from ${result.editor}: ${result.errors.join(', ')}`);
            continue;
         }

         if (result.removed) {
            this.output.success(`Removed marketplace "${name}" from ${result.editor}`);
         }
      }
   }
}
