import { Args, Flags } from '@oclif/core';
import { homedir } from 'node:os';
import { join } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import {
   updateConfig,
   updateLocalConfig,
   getLocalConfigPath,
   removeFromGlobalMcpConfig,
   trackRemoval,
} from '@a1st/aix-core';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';

/** Global MCP config paths for editors with global-only MCP support */
const GLOBAL_MCP_PATHS: Record<string, string> = {
   windsurf: '.codeium/windsurf/mcp_config.json',
   codex: '.codex/config.toml',
};

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

      // Remove from global MCP configs for editors with global-only MCP (Windsurf, Codex)
      if (!flags['no-sync']) {
         for (const editor of ['windsurf', 'codex']) {
            const globalPath = GLOBAL_MCP_PATHS[editor];

            if (!globalPath) {
               continue;
            }

            const fullPath = join(homedir(), globalPath),
                  // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
                  removed = await removeFromGlobalMcpConfig(fullPath, args.name);

            if (removed) {
               this.output.success(`Removed "${args.name}" from global ${editor} MCP config`);
            }
         }

         // Re-install MCP config to update editor configs (regenerates without the removed server)
         if (loaded && !flags.local) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               sections: ['mcp'],
            });

            if (installResult.installed) {
               this.logInstallResults(
                  formatInstallResults(installResult.results).map((r) =>
                     Object.assign({}, r, {
                        message: r.success ? `Updated MCP config for ${r.editor}` : r.message,
                     }),
                  ),
               );
            }
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
}
