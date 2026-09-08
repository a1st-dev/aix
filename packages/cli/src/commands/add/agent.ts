import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   loadAgent,
   parseSourceReference,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { AgentObject, AgentValue } from '@a1st/aix-schema';
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

export default class AddAgent extends BaseCommand<typeof AddAgent> {
   static override description = 'Add an agent to ai.json';
   static override strict = false;

   static override examples = [
      '<%= config.bin %> <%= command.id %> ./agents/reviewer.md',
      '<%= config.bin %> <%= command.id %> ./agents/reviewer.agent.md',
      '<%= config.bin %> <%= command.id %> https://github.com/anthropics/agents/blob/main/reviewer.md',
      '<%= config.bin %> <%= command.id %> github:myorg/agents/coder.md --name coder',
      '<%= config.bin %> <%= command.id %> ./agents/coder.md --name my-coder --mode primary',
      '<%= config.bin %> <%= command.id %> ./agents/coder.md --model claude-3-7-sonnet --tools bash,edit',
      '<%= config.bin %> <%= command.id %> ./agents/coder.md --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Agent source: local path (.md/.agent.md), git URL, git shorthand, or npm package name',
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
         description: 'Override inferred agent name',
      }),
      ref: Flags.string({
         char: 'r',
         description: 'Git ref (branch, tag, commit) - overrides ref in URL',
      }),
      mode: Flags.string({
         char: 'm',
         description: 'Agent mode: subagent or primary',
         options: ['subagent', 'primary'],
         default: 'subagent',
      }),
      model: Flags.string({
         description: 'Model alias or model ID for this agent',
      }),
      tools: Flags.string({
         description: 'Comma-separated list of tools available to this agent',
      }),
      description: Flags.string({
         char: 'd',
         description: 'When this agent should be used',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags, argv } = await this.parse(AddAgent),
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
         disallowedFlags: ['name', 'ref', 'mode', 'model', 'tools', 'description'],
         error: this.error.bind(this),
      });

      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      const addedItems = await sources.reduce<Promise<Array<{ name: string; value: AgentValue }>>>(
         async (memoPromise, source) => {
            const memo = await memoPromise,
                  parsed = parseSourceReference(source, { type: 'agent', refOverride: flags.ref }),
                  agentName = flags.name ?? parsed.inferredName;

            if (!agentName) {
               this.error(`Could not infer agent name from source "${source}". Please provide --name.`);
            }

            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(agentName)) {
               this.error(
                  `Invalid agent name "${agentName}". ` +
                  'Must be lowercase alphanumeric with single hyphens (e.g., "code-reviewer"). ' +
                  'Use --name to specify a valid name.',
               );
            }

            const agentValue = this.applyFlagOverrides(parsed.value as AgentValue, flags);

            try {
               await loadAgent(agentName, agentValue, basePath);
            } catch (error) {
               const message = error instanceof Error ? error.message : String(error);

               this.error(`Failed to load agent: ${message}`);
            }

            await persistAddedItem({
               loaded,
               local: flags.local,
               output: this.output,
               directInstallMessage: userScopeAdd
                  ? 'User-scope add: installing directly to editors without reading project ai.json'
                  : undefined,
               localSuccessMessage: `Added agent "${agentName}" to ai.local.json`,
               projectSuccessMessage: `Added agent "${agentName}"`,
               saveLocal: async (localPath) => {
                  await updateLocalConfig(localPath, (config) => ({
                     ...config,
                     agents: {
                        ...config.agents,
                        [agentName]: agentValue,
                     },
                  }));
               },
               saveProject: async (configPath) => {
                  await updateConfig(configPath, (config) => ({
                     ...config,
                     agents: {
                        ...config.agents,
                        [agentName]: agentValue,
                     },
                  }));
               },
            });

            memo.push({ name: agentName, value: agentValue });

            if (!loaded || flags.local) {
               await installAddedItem({
                  logInstallResults: (results) => {
                     this.logInstallResults(results);
                  },
                  skipInstall: flags['no-install'],
                  loaded,
                  local: flags.local,
                  installSections: ['agents'],
                  itemSection: 'agents',
                  itemName: agentName,
                  itemValue: agentValue,
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
            installSections: ['agents'],
            itemSection: 'agents',
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
            type: 'agent',
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

   private applyFlagOverrides(
      value: AgentValue,
      flags: {
         mode?: string;
         model?: string;
         tools?: string;
         description?: string;
      },
   ): AgentValue {
      const hasOverrides = Boolean(
         (flags.mode && flags.mode !== 'subagent') ||
         flags.model ||
         flags.tools ||
         flags.description,
      );

      if (!hasOverrides) {
         return value;
      }

      const baseObj: AgentObject = typeof value === 'string'
         ? { path: value }
         : { ...value };

      if (flags.mode) {
         baseObj.mode = flags.mode as 'subagent' | 'primary';
      }
      if (flags.model) {
         baseObj.model = flags.model;
      }
      if (flags.description) {
         baseObj.description = flags.description;
      }
      if (flags.tools) {
         baseObj.tools = flags.tools.split(',').map((tool) => tool.trim()).filter(Boolean);
      }

      return baseObj;
   }
}
