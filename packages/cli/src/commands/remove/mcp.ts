import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   detectEditors,
   updateConfig,
   updateLocalConfig,
   getLocalConfigPath,
   removeMcpFromEditors,
   trackRemoval,
   type EditorName,
} from '@a1st/aix-core';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';

export default class RemoveMcp extends BaseCommand<typeof RemoveMcp> {
   static override description = 'Remove an MCP server from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> github',
      '<%= config.bin %> <%= command.id %> filesystem --yes',
      '<%= config.bin %> <%= command.id %> github --no-sync',
   ];

   static override args = {
      name: Args.string({
         description: 'MCP server name to remove',
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
      'no-sync': Flags.boolean({
         description: 'Skip syncing changes to editor MCP configs',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemoveMcp);
      const loaded = await this.loadConfig();
      const targetScope = resolveConfigScope(flags as { scope?: string; user?: boolean; project?: boolean });
      const targetEditors = resolveTargetEditors(flags.target);

      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if MCP server exists in merged config (if we have one)
      if (loaded && !loaded.config.mcp?.[args.name]) {
         this.error(`MCP server "${args.name}" not found in configuration`);
      }

      // Confirm removal
      if (!flags.yes) {
         const targetFile = flags.local ? 'ai.local.json' : 'ai.json';
         const confirmed = await confirm({
            message: loaded
               ? `Remove MCP server "${args.name}" from ${targetFile}?`
               : `Remove MCP server "${args.name}" from editor configs?`,
            default: false,
         });

         if (!confirmed) {
            this.output.info('Cancelled');
            return;
         }
      }

      // Update ai.json / ai.local.json if it exists
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [args.name]: _, ...remainingMcp } = config.mcp ?? {};

            return {
               ...config,
               mcp: remainingMcp,
            };
         });
         this.output.success(`Removed MCP server "${args.name}" from ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [args.name]: _, ...remainingMcp } = config.mcp ?? {};

            return {
               ...config,
               mcp: remainingMcp,
            };
         });
         this.output.success(`Removed MCP server "${args.name}"`);
      }

      // Sync editor MCP configs so removals affect the same editor set as add/install.
      if (!flags['no-sync']) {
         // Re-install MCP config to update editor configs (regenerates without the removed server)
         if (loaded && !flags.local) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               sections: ['mcp'],
               scope: targetScope,
               editors: targetEditors,
            });

            if (installResult.installed) {
               this.logInstallResults(
                  formatInstallResults(installResult.results).map((r) =>
                     Object.assign({}, r, {
                        message: r.success ? `Updated MCP config for ${r.editor}` : r.message,
                     }),
                  ),
               );

               await this.removeMcpFromEditorConfigs(
                  installResult.editors,
                  args.name,
                  dirname(loaded.path),
                  targetScope,
               );
            }
         } else {
            const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
                  editors = targetEditors ?? await detectEditors(projectRoot);

            await this.removeMcpFromEditorConfigs(editors, args.name, projectRoot, targetScope);
         }
      }

      // Track the removal in state
      await trackRemoval(targetScope, 'mcp', args.name, process.cwd());

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'mcp',
            name: args.name,
         });
      }
   }

   private async removeMcpFromEditorConfigs(
      editors: readonly EditorName[],
      name: string,
      projectRoot: string,
      targetScope: 'project' | 'user',
   ): Promise<void> {
      const results = await removeMcpFromEditors(editors, name, projectRoot, { targetScope });

      for (const result of results) {
         if (!result.success) {
            this.output.error(`Failed to remove "${name}" from ${result.editor}: ${result.errors.join(', ')}`);
            continue;
         }

         if (result.removed) {
            this.output.success(`Removed "${name}" from ${result.editor} MCP config`);
         }
      }
   }
}
