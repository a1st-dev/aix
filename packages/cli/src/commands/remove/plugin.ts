import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath, type EditorName } from '@a1st/aix-core';
import { normalizeEditors, resolveScope } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd } from '../../lib/install-helper.js';

export default class RemovePlugin extends BaseCommand<typeof RemovePlugin> {
   static override description = 'Remove a plugin from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> code-review',
      '<%= config.bin %> <%= command.id %> code-review@claude-plugins-official --yes',
      '<%= config.bin %> <%= command.id %> code-review --no-install',
   ];

   static override args = {
      name: Args.string({
         description: 'Plugin name to remove',
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
      const { args, flags } = await this.parse(RemovePlugin);
      const loaded = await this.loadConfig();
      const targetEditors = resolveTargetEditors(flags.target);
      const pluginName = args.name;
      const targetScope = resolveConfigScope(
         flags as { scope?: string; user?: boolean; project?: boolean },
         loaded && !flags.local ? resolveScope(loaded.config) : undefined,
      );

      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if plugin exists in merged config (if we have one)
      if (loaded && !loaded.config.plugins?.[pluginName]) {
         this.error(`Plugin "${pluginName}" not found in configuration`);
      }

      // Confirm removal
      if (!flags.yes) {
         const targetFile = flags.local ? 'ai.local.json' : 'ai.json',
               message = `Remove plugin "${pluginName}" from ${targetFile}?`;

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
            const { [pluginName]: _, ...remainingPlugins } = config.plugins ?? {};

            return {
               ...config,
               plugins: remainingPlugins,
            };
         });
         this.output.success(`Removed plugin "${pluginName}" from ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [pluginName]: _, ...remainingPlugins } = config.plugins ?? {};

            return {
               ...config,
               plugins: remainingPlugins,
            };
         });
         this.output.success(`Removed plugin "${pluginName}"`);
      }

      // Re-install remaining config to editors unless skipped
      if (!flags['no-install'] && loaded) {
         const configuredEditors = loaded.config.editors,
               editors = targetEditors ?? (configuredEditors
                  ? (Object.keys(normalizeEditors(configuredEditors)) as EditorName[])
                  : undefined);

         await installAfterAdd({
            configPath: loaded.path,
            sections: ['plugins'],
            scope: targetScope,
            quiet: true,
            editors,
         });
      }

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'plugin',
            name: pluginName,
         });
      }
   }
}
