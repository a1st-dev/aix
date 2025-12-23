import { Args, Flags } from '@oclif/core';
import { select } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath } from '@a1st/aix-core';
import { McpRegistryClient, type ServerResponse, type Package } from '@a1st/mcp-registry-client';
import type { McpServerConfig } from '@a1st/aix-schema';

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
      ...localFlag,
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

      let serverConfig: McpServerConfig;
      let serverName = args.name;

      if (flags.command) {
         const config: Record<string, unknown> = { command: flags.command };

         if (flags.args) {
            config.args = flags.args.split(',').map((a) => a.trim());
         }
         if (flags.env) {
            config.env = Object.fromEntries(
               flags.env.split(',').map((e) => {
                  const idx = e.indexOf('=');

                  if (idx === -1) {
                     return [e.trim(), ''];
                  }
                  return [e.slice(0, idx).trim(), e.slice(idx + 1).trim()];
               }),
            );
         }
         serverConfig = config as McpServerConfig;
      } else if (flags.url) {
         serverConfig = { url: flags.url } as McpServerConfig;
      } else {
         // No --command or --url provided: search the MCP Registry
         const result = await this.searchRegistry(args.name);

         if (!result) {
            return;
         }
         serverConfig = result.config;
         serverName = result.name;
      }

      // Determine target file based on --local flag
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => ({
            ...config,
            mcp: {
               ...config.mcp,
               [serverName]: serverConfig,
            },
         }));
         this.output.success(`Added MCP server "${serverName}" to ai.local.json`);
      } else {
         if (!loaded) {
            this.error(
               'No ai.json found. Run `aix init` to create one, or use --local to write to ai.local.json.',
            );
         }
         await updateConfig(loaded.path, (config) => ({
            ...config,
            mcp: {
               ...config.mcp,
               [serverName]: serverConfig,
            },
         }));
         this.output.success(`Added MCP server "${serverName}"`);

         // Auto-install to configured editors unless --no-install
         if (!flags['no-install']) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               scopes: ['mcp'],
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'mcp',
            name: serverName,
            config: serverConfig,
         });
      }
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
      const pkg = this.findNpmPackage(selected.server.packages);

      if (!pkg) {
         this.error(
            `Server "${selected.server.name}" has no compatible npm package with stdio transport.\n\n` +
               'You may need to configure it manually with --command or --url.',
         );
      }

      // Build the config from the registry package info
      const config = this.buildConfigFromPackage(pkg);

      // Use a friendly name (last part of reverse-DNS name)
      const nameParts = selected.server.name.split('/');
      const friendlyName = nameParts[nameParts.length - 1] ?? selected.server.name;

      return { config, name: friendlyName };
   }

   /**
    * Find the first npm package with stdio transport from the packages array.
    */
   private findNpmPackage(packages: Package[] | null | undefined): Package | undefined {
      if (!packages) {
         return undefined;
      }
      return packages.find((p) => p.registryType === 'npm' && p.transport.type === 'stdio');
   }

   /**
    * Build an MCP server config from a registry package.
    */
   private buildConfigFromPackage(pkg: Package): McpServerConfig {
      const config: Record<string, unknown> = {
         command: `npx ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}`,
      };

      // Add environment variables if specified
      if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
         const env: Record<string, string> = {};

         for (const envVar of pkg.environmentVariables) {
            // Use default value, or placeholder for required secrets
            if (envVar.default) {
               env[envVar.name] = envVar.default;
            } else if (envVar.isRequired) {
               env[envVar.name] = envVar.isSecret ? '<YOUR_SECRET>' : '<REQUIRED>';
            }
         }
         if (Object.keys(env).length > 0) {
            config.env = env;
         }
      }

      return config as McpServerConfig;
   }
}
