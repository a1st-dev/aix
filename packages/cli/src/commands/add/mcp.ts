import { Args, Flags } from '@oclif/core';
import { select } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { updateConfig, updateLocalConfig } from '@a1st/aix-core';
import { McpRegistryClient, type ServerResponse } from '@a1st/mcp-registry-client';
import type { McpServerConfig } from '@a1st/aix-schema';
import {
   buildMcpServerConfig,
   findCompatibleNpmPackage,
   installAddedItem,
   persistAddedItem,
   refreshLockfileAfterAdd,
} from '../../lib/add-command-helper.js';

export default class AddMcp extends BaseCommand<typeof AddMcp> {
   static override description = 'Add an MCP server to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> playwright',
      '<%= config.bin %> <%= command.id %> filesystem',
      '<%= config.bin %> <%= command.id %> github --command "npx @modelcontextprotocol/server-github"',
      '<%= config.bin %> <%= command.id %> filesystem --command "npx @modelcontextprotocol/server-filesystem" --args "/path/to/dir"',
      '<%= config.bin %> <%= command.id %> custom --url "http://localhost:3000/mcp"',
      '<%= config.bin %> <%= command.id %> github --command "npx @modelcontextprotocol/server-github" --no-install',
   ];

   static override args = {
      name: Args.string({
         description: 'MCP server name',
         required: true,
      }),
   };

   static override flags = {
      ...addLockFlag,
      ...localFlag,
      ...configScopeFlags,
      command: Flags.string({
         description: 'Command to run (stdio transport)',
      }),
      args: Flags.string({
         description: 'Command arguments (comma-separated)',
      }),
      url: Flags.string({
         description: 'SSE endpoint URL',
      }),
      env: Flags.string({
         description: 'Environment variables (KEY=value,KEY2=value2)',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(AddMcp);
      const loaded = await this.loadConfig();
      const targetScope = resolveConfigScope(flags as { scope?: string; user?: boolean; project?: boolean });
      const lockableConfigPath = getLockableConfigPath(loaded);

      let serverConfig: McpServerConfig;
      let serverName = args.name;
      let lockfilePath: string | undefined;

      if (flags.lock && !lockableConfigPath) {
         this.error('--lock requires a local ai.json. Run `aix init` first, or omit --lock.');
      }

      if (flags.command) {
         const argsList = flags.args?.split(',').map((arg) => arg.trim());
         const envEntries = flags.env?.split(',').map((entry) => {
            const idx = entry.indexOf('=');

            if (idx === -1) {
               return [entry.trim(), ''];
            }

            return [entry.slice(0, idx).trim(), entry.slice(idx + 1).trim()];
         });
         const env = envEntries ? Object.fromEntries(envEntries) : undefined;

         serverConfig = {
            command: flags.command,
            ...(argsList ? { args: argsList } : {}),
            ...(env ? { env } : {}),
         };
      } else if (flags.url) {
         serverConfig = { url: flags.url };
      } else {
         // No --command or --url provided: search the MCP Registry
         const result = await this.searchRegistry(args.name);

         if (!result) {
            return;
         }
         serverConfig = result.config;
         serverName = result.name;
      }

      // Update ai.json if it exists (or ai.local.json with --local)
      await persistAddedItem({
         loaded,
         local: flags.local,
         output: this.output,
         localSuccessMessage: `Added MCP server "${serverName}" to ai.local.json`,
         projectSuccessMessage: `Added MCP server "${serverName}"`,
         saveLocal: async (localPath) => {
            await updateLocalConfig(localPath, (config) => ({
               ...config,
               mcp: {
                  ...config.mcp,
                  [serverName]: serverConfig,
               },
            }));
         },
         saveProject: async (configPath) => {
            await updateConfig(configPath, (config) => ({
               ...config,
               mcp: {
                  ...config.mcp,
                  [serverName]: serverConfig,
               },
            }));
         },
      });

      lockfilePath = await refreshLockfileAfterAdd(flags.lock, lockableConfigPath, this.output);

      await installAddedItem({
         logInstallResults: (results) => {
            this.logInstallResults(results);
         },
         skipInstall: flags['no-install'],
         loaded,
         local: flags.local,
         installSections: ['mcp'],
         itemSection: 'mcp',
         itemName: serverName,
         itemValue: serverConfig,
         scope: targetScope,
         projectRoot: process.cwd(),
      });

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'mcp',
            name: serverName,
            config: serverConfig,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   /**
    * Search the MCP Registry for a server by name.
    * If multiple results are found, prompts the user to select one.
    * Returns the server config and name, or undefined if cancelled/not found.
    */
   private async searchRegistry(
      query: string,
   ): Promise<{ config: McpServerConfig; name: string } | undefined> {
      this.output.startSpinner(`Searching MCP Registry for "${query}"...`);

      const client = new McpRegistryClient();
      let results: ServerResponse[];

      try {
         const response = await client.search(query);

         results = response.servers ?? [];
      } catch (error) {
         this.output.stopSpinner(false, 'Failed to search MCP Registry');
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Registry search failed: ${message}`);
      }

      if (results.length === 0) {
         this.output.stopSpinner(false, 'No servers found');
         this.error(
            `No MCP servers found matching "${query}".\n\n` +
               'You can manually specify a server with:\n' +
               `  aix add mcp ${query} --command "npx @some/mcp-server"\n` +
               `  aix add mcp ${query} --url "http://localhost:3000/mcp"`,
         );
      }

      this.output.stopSpinner(true, `Found ${results.length} server(s)`);

      // Select server (prompt if multiple)
      let selected: ServerResponse;

      if (results.length === 1) {
         selected = results[0] as ServerResponse;
         this.output.info(`Using: ${selected.server.name}`);
      } else {
         selected = await select<ServerResponse>({
            message: 'Multiple servers found. Which one do you want to add?',
            choices: results.map((r) => ({
               name: `${r.server.name} - ${r.server.description}`,
               value: r,
            })),
         });
      }

      // Find an npm package with stdio transport
      const pkg = findCompatibleNpmPackage(selected.server.packages);

      if (!pkg) {
         this.error(
            `Server "${selected.server.name}" has no compatible npm package with stdio transport.\n\n` +
               'You may need to configure it manually with --command or --url.',
         );
      }

      // Build the config from the registry package info
      const config = buildMcpServerConfig(pkg);

      // Use a friendly name (last part of reverse-DNS name)
      const nameParts = selected.server.name.split('/');
      const friendlyName = nameParts[nameParts.length - 1] ?? selected.server.name;

      return { config, name: friendlyName };
   }

}
