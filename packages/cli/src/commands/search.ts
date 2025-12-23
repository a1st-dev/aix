import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../base-command.js';
import {
   SearchRegistry,
   parseExperimentalFlags,
   type SearchResult,
   type SearchType,
} from '../lib/search/index.js';
import { renderSearchUI, type InstallItem } from '../ui/search/index.js';
import { addSkill, addMcp, removeSkill, removeMcp, findConfigPath } from '../lib/add-helper.js';

type OutputMode = 'interactive' | 'plain' | 'json';

function getOutputMode(flags: { json: boolean; plain: boolean }): OutputMode {
   if (flags.json) {
      return 'json';
   }
   if (flags.plain) {
      return 'plain';
   }
   if (!process.stdout.isTTY) {
      return 'plain';
   }
   return 'interactive';
}

export default class Search extends BaseCommand<typeof Search> {
   static override description = 'Search for aix skills and MCP servers';

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> playwright --type mcp',
      '<%= config.bin %> <%= command.id %> react --type skills',
      '<%= config.bin %> <%= command.id %> github --type skills --type mcp',
      '<%= config.bin %> <%= command.id %> testing -x source:claude-plugins-dev',
   ];

   static override args = {
      query: Args.string({
         description: 'Search query (optional in interactive mode)',
         required: false,
      }),
   };

   static override flags = {
      registry: Flags.string({
         char: 'r',
         description: 'NPM registry URL to search',
         env: 'NPM_CONFIG_REGISTRY',
         default: 'https://registry.npmjs.org',
      }),
      type: Flags.string({
         char: 't',
         description: 'Type of resources to search (can be specified multiple times)',
         options: ['skills', 'mcp'],
         multiple: true,
      }),
      experimental: Flags.string({
         char: 'x',
         description: 'Enable experimental features (e.g., source:claude-plugins-dev)',
         multiple: true,
         default: [],
      }),
      plain: Flags.boolean({
         char: 'p',
         description: 'Force plain text output (non-interactive)',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args } = await this.parse(Search);
      const types: SearchType[] = (this.flags.type as SearchType[] | undefined)?.length
         ? (this.flags.type as SearchType[])
         : ['skills', 'mcp'];

      const outputMode = getOutputMode({ json: this.flags.json, plain: this.flags.plain });

      // Parse experimental flags and create registry with enabled sources
      const experimentalSources = parseExperimentalFlags(this.flags.experimental as string[]);
      const registry = new SearchRegistry({
         npmRegistry: this.flags.registry,
         experimentalSources,
      });

      // Log which experimental sources are enabled
      if (experimentalSources.size > 0 && outputMode !== 'json') {
         const sourceNames = Array.from(experimentalSources).join(', ');

         this.output.info(`Experimental sources enabled: ${sourceNames}`);
      }

      // Interactive mode
      if (outputMode === 'interactive') {
         try {
            await this.runInteractive(registry, types, args.query);
            return;
         } catch (error) {
            // Fall back to plain mode if interactive fails (e.g., stdin issues)
            const message = error instanceof Error ? error.message : String(error);
            const isKnownError = message.includes('EISDIR') || message.includes('Raw mode');

            if (isKnownError) {
               this.output.warn(
                  `Interactive mode unavailable, falling back to plain output. (${message})`,
               );
            } else {
               // Log the full error for debugging unknown issues
               this.output.warn(`Interactive mode failed: ${message}`);
               if (error instanceof Error && error.stack) {
                  this.output.log(error.stack);
               }
               throw error;
            }
         }
      }

      // Plain/JSON mode - requires query
      if (!args.query) {
         this.error(
            'Search query is required in plain/JSON mode. Use interactive mode or provide a query.',
         );
      }
      await this.runPlain(registry, types, args.query);
   }

   private async runInteractive(
      registry: SearchRegistry,
      types: SearchType[],
      initialQuery?: string,
   ): Promise<void> {
      let configPath: string | null = null;

      try {
         configPath = await findConfigPath();
         if (!configPath) {
            this.output.warn('No ai.json found. Run "aix init" first to create one.');
            this.output.info('Falling back to preview mode (no installation).');
         }
      } catch (error) {
         // Show validation/parse errors (not "not found" - that's handled above)
         const message = error instanceof Error ? error.message : String(error);

         this.output.warn(`Failed to load ai.json: ${message}`);
         this.output.info('Falling back to preview mode (no installation).');
      }

      // Filter types to only those with available sources
      const availableTypes = types.filter((t) => registry.hasSourcesForType(t));

      if (availableTypes.length === 0) {
         this.output.warn('No search sources available for the requested types.');
         return;
      }

      const handleInstall = async (item: InstallItem): Promise<boolean> => {
         const itemName = item.result.name;

         if (!configPath) {
            const cmd = item.type === 'skills' ? 'skill' : 'mcp';

            this.output.info(`Would run: aix add ${cmd} ${itemName}`);
            return false;
         }

         const result =
            item.type === 'skills'
               ? await addSkill({ configPath, name: itemName, source: itemName })
               : await addMcp({ configPath, name: itemName });

         return result.success;
      };

      const handleUninstall = async (item: InstallItem): Promise<boolean> => {
         const itemName = item.result.name;

         if (!configPath) {
            const cmd = item.type === 'skills' ? 'skill' : 'mcp';

            this.output.info(`Would run: aix remove ${cmd} ${itemName}`);
            return false;
         }

         const result =
            item.type === 'skills'
               ? await removeSkill({ configPath, name: itemName })
               : await removeMcp({ configPath, name: itemName });

         return result.success;
      };

      const { installedItems } = await renderSearchUI({
         initialQuery,
         types: availableTypes,
         registry: {
            searchSkills: (opts) => registry.searchSkills(opts),
            searchMcp: (opts) => registry.searchMcp(opts),
         },
         onInstall: handleInstall,
         onUninstall: handleUninstall,
      });

      // Print summary of installed items
      if (installedItems.length > 0) {
         this.output.log('');
         this.output.success(`Installed ${installedItems.length} item(s):`);
         for (const item of installedItems) {
            const typeLabel = item.type === 'skills' ? 'skill' : 'mcp';

            this.output.log(`  • ${item.result.name} (${typeLabel})`);
         }
      }
   }

   private async runPlain(registry: SearchRegistry, types: SearchType[], query: string): Promise<void> {
      const searchSkills = types.includes('skills'),
            searchMcp = types.includes('mcp');

      const searches: Promise<{ type: SearchType; results: SearchResult[] }>[] = [];

      if (searchSkills) {
         searches.push(
            registry.searchSkills({ query }).then((results) => ({ type: 'skills', results })),
         );
      }
      if (searchMcp) {
         searches.push(registry.searchMcp({ query }).then((results) => ({ type: 'mcp', results })));
      }

      this.output.startSpinner('Searching...');
      const searchResults = await Promise.all(searches);

      this.output.stopSpinner(true);

      const resultsByType = Object.fromEntries(searchResults.map((r) => [r.type, r.results])) as Record<
         SearchType,
         SearchResult[]
      >;

      const totalResults = searchResults.reduce((sum, r) => sum + r.results.length, 0);

      if (totalResults === 0) {
         this.output.info('No results found matching your query.');
         return;
      }

      if (this.flags.json) {
         this.output.json(resultsByType);
         return;
      }

      if (resultsByType.skills?.length) {
         this.output.header('Skills');
         for (const skill of resultsByType.skills) {
            const version = skill.version ? this.output.dim(` (v${skill.version})`) : '',
                  sourceTag = skill.source !== 'npm' ? this.output.dim(` [${skill.source}]`) : '';

            this.output.log(`  ${this.output.cyan(skill.name)}${version}${sourceTag}`);
            if (skill.description) {
               this.output.log(`    ${skill.description}`);
            }
            this.output.log('');
         }
      }

      if (resultsByType.mcp?.length) {
         this.output.header('MCP Servers');
         for (const server of resultsByType.mcp) {
            const version = server.version ? this.output.dim(` (v${server.version})`) : '';

            this.output.log(`  ${this.output.cyan(server.name)}${version}`);
            if (server.description) {
               this.output.log(`    ${server.description}`);
            }
            this.output.log('');
         }
      }

      if (searchSkills) {
         this.output.info('Install skills with: aix add skill <name>');
      }
      if (searchMcp) {
         this.output.info('Install MCP servers with: aix add mcp <name>');
      }
   }
}
