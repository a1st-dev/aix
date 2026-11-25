import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { configOnlyFlag } from '../../flags/config-only.js';
import { removeLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveTargetScope } from '../../flags/scope.js';
import { rejectIneffectiveSaveFlags, saveFlag } from '../../flags/save.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   updateConfig,
   updateLocalConfig,
   getLocalConfigPath,
   removePluginFromEditors,
   trackRemoval,
   type EditorName,
} from '@a1st/aix-core';
import { confirmAction } from '../../lib/confirm.js';
import { installAfterAdd } from '../../lib/install-helper.js';
import { getLockableConfigPath, refreshLockfileAfterRemoval } from '../../lib/lockfile-helper.js';
import { resolveRemovalEditors } from '../../lib/resolve-removal-editors.js';
import { printEditorRemovalPreview } from '../../lib/delete-helper.js';

export default class RemovePlugin extends BaseCommand<typeof RemovePlugin> {
   static override description = 'Remove a plugin';

   static override examples = [
      '<%= config.bin %> <%= command.id %> code-review',
      '<%= config.bin %> <%= command.id %> code-review@claude-plugins-official --yes',
      '<%= config.bin %> <%= command.id %> code-review --save --config-only',
   ];

   static override args = {
      name: Args.string({
         description: 'Plugin name to remove',
         required: true,
      }),
   };

   static override flags = {
      ...removeLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...saveFlag,
      ...targetFlag,
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
      ...configOnlyFlag,
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemovePlugin);
      const loaded = flags.save ? await this.loadConfig() : undefined;
      const targetEditors = resolveTargetEditors(flags.target);
      const pluginName = args.name;
      const targetScope = resolveTargetScope(flags, loaded?.config);

      rejectIneffectiveSaveFlags(flags, this.error.bind(this));
      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if plugin exists in merged config (if we have one)
      if (flags.save && (!loaded || !loaded.config.plugins?.[pluginName])) {
         this.error(`Plugin "${pluginName}" not found in configuration`);
      }

      const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
            editors = await resolveRemovalEditors({
               targetEditors,
               section: 'plugins',
               itemName: pluginName,
               configuredEditors: flags.local ? undefined : loaded?.config.editors,
               scope: targetScope,
               projectRoot,
            });

      if (!flags['config-only']) {
         printEditorRemovalPreview({ output: this.output, editors, itemType: 'plugin', itemName: pluginName, scope: targetScope });
      }

      // Confirm removal
      if (!flags.yes) {
         const targetFile = flags.local ? 'ai.local.json' : 'ai.json',
               message = loaded
                  ? `Remove plugin "${pluginName}" from ${targetFile}?`
                  : `Remove plugin "${pluginName}" from editor configs?`;

         const confirmed = await confirmAction(message, this.error.bind(this));

         if (!confirmed) {
            this.output.info('Cancelled');
            return;
         }
      }

      const lockableConfigPath = getLockableConfigPath(flags.local, loaded?.path);

      // Update ai.json / ai.local.json if present
      if (flags.save && flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [pluginName]: _, ...remainingPlugins } = config.plugins ?? {};

            return {
               ...config,
               plugins: remainingPlugins,
            };
         });
         this.output.success(`Removed plugin "${pluginName}" from ai.local.json`);
      } else if (flags.save && loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [pluginName]: _, ...remainingPlugins } = config.plugins ?? {};

            return {
               ...config,
               plugins: remainingPlugins,
            };
         });
         this.output.success(`Removed plugin "${pluginName}"`);
      }

      const lockfilePath = await refreshLockfileAfterRemoval(flags.lock, lockableConfigPath, this.output);

      // Clean up plugin config in editors unless skipped
      if (!flags['config-only']) {
         await this.removePluginFromEditorConfigs(editors, pluginName, projectRoot, targetScope);

         if (loaded) {
            await installAfterAdd({
               configPath: loaded.path,
               sections: ['plugins'],
               scope: targetScope,
               quiet: true,
               editors: targetEditors,
            });
         }
      }

      await trackRemoval({ scope: targetScope, section: 'plugins', name: pluginName, projectRoot, editors: targetEditors });

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'plugin',
            name: pluginName,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   private async removePluginFromEditorConfigs(
      editors: readonly EditorName[],
      name: string,
      projectRoot: string,
      targetScope: 'project' | 'user',
   ): Promise<void> {
      const results = await removePluginFromEditors(editors, name, projectRoot, { targetScope });

      for (const result of results) {
         if (!result.success) {
            this.output.error(`Failed to remove plugin "${name}" from ${result.editor}: ${result.errors.join(', ')}`);
            this.markFailed();
            continue;
         }

         if (result.removed) {
            this.output.success(`Removed plugin "${name}" from ${result.editor}`);
         }
      }
   }
}
