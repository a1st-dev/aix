import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   appendHooks,
   resolveDirectInstallConfig,
   updateConfig,
   updateLocalConfig,
   type EditorName,
   type LoadedConfig,
} from '@a1st/aix-core';
import {
   hookEvents,
   hooksSchema,
   isHookEvent,
   type ConfigScope,
   type HookAction,
   type HookMatcher,
   type HooksConfig,
} from '@a1st/aix-schema';
import {
   installAddedItem,
   isUserScopeAdd,
   persistAddedItem,
   rejectUserScopeProjectConfigFlags,
   resolveAddTargetScope,
   refreshLockfileAfterAdd,
} from '../../lib/add-command-helper.js';

/** A hook event name contains none of the characters that mark a path, URL, or package reference. */
const SOURCE_CHARACTERS = /[./:\\]/;

interface HookInstallContext {
   loaded: LoadedConfig | undefined;
   targetScope: ConfigScope;
   targetEditors: EditorName[] | undefined;
}

export default class AddHook extends BaseCommand<typeof AddHook> {
   static override description = 'Add a lifecycle hook to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> pre_command --command "npm run lint"',
      '<%= config.bin %> <%= command.id %> pre_file_write --matcher "Write|Edit" --command ./scripts/guard.sh',
      '<%= config.bin %> <%= command.id %> session_start --command ./scripts/init.sh --timeout 30',
      '<%= config.bin %> <%= command.id %> agent_stop --prompt "Summarize what changed" --type agent',
      '<%= config.bin %> <%= command.id %> ./hooks/guard.json',
      '<%= config.bin %> <%= command.id %> github:myorg/config/hooks/guard.json',
      '<%= config.bin %> <%= command.id %> pre_command --command "npm run lint" --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Hook event name, or a path, URL, or npm/git reference to a hook JSON fragment',
         required: true,
      }),
   };

   static override flags = {
      ...addLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...targetFlag,
      command: Flags.string({
         description: 'Shell command to run when the event fires',
      }),
      url: Flags.string({
         description: 'URL to POST the hook payload to (http action)',
      }),
      prompt: Flags.string({
         description: 'Prompt text for an LLM-evaluated hook',
      }),
      type: Flags.string({
         description: 'Action kind (inferred from --command / --url / --prompt when omitted)',
         options: ['command', 'http', 'prompt', 'agent'],
      }),
      matcher: Flags.string({
         char: 'm',
         description: 'Pattern selecting which tools or actions the hook applies to',
      }),
      timeout: Flags.integer({
         description: 'Timeout in seconds',
      }),
      description: Flags.string({
         char: 'd',
         description: 'Free-form description for the hook group',
      }),
      name: Flags.string({
         char: 'n',
         description: 'Hook fragment name (inferred from the source if not provided)',
      }),
      ref: Flags.string({
         char: 'r',
         description: 'Git ref (branch, tag, commit) - overrides ref in URL',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(AddHook),
            userScopeAdd = isUserScopeAdd(flags),
            loaded = userScopeAdd ? undefined : await this.loadConfig(),
            targetScope = resolveAddTargetScope(flags, loaded),
            lockableConfigPath = getLockableConfigPath(loaded),
            targetEditors = resolveTargetEditors(flags.target);

      rejectUserScopeProjectConfigFlags({
         flags,
         error: this.error.bind(this),
      });
      if (flags.lock && !lockableConfigPath) {
         this.error('--lock requires a local ai.json. Run `aix init` first, or omit --lock.');
      }
      validateTargetEditors(targetEditors, this.error.bind(this));

      const hooks = await this.resolveHooks(args.source),
            events = Object.keys(hooks);

      if (events.length === 0) {
         this.error(`No hooks found in "${args.source}".`);
      }

      const summary = events.join(', ');

      await persistAddedItem({
         loaded,
         local: flags.local,
         output: this.output,
         directInstallMessage: userScopeAdd
            ? 'User-scope add: installing directly to editors without reading project ai.json'
            : undefined,
         localSuccessMessage: `Added hook for "${summary}" to ai.local.json`,
         projectSuccessMessage: `Added hook for "${summary}"`,
         saveLocal: async (localPath) => {
            await updateLocalConfig(localPath, (config) => {
               return { ...config, hooks: appendHooks(config.hooks, hooks) };
            });
         },
         saveProject: async (configPath) => {
            await updateConfig(configPath, (config) => {
               return { ...config, hooks: appendHooks(config.hooks, hooks) };
            });
         },
      });

      const lockfilePath = await refreshLockfileAfterAdd(flags.lock, lockableConfigPath, this.output);

      await this.installHooks(hooks, { loaded, targetScope, targetEditors });

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'hook',
            events,
            hooks,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   /**
    * Build the hooks to add: either from the inline action flags, when the argument is a
    * hook event name, or by resolving a hook fragment from a file, URL, npm package, or
    * git repository.
    */
   private async resolveHooks(source: string): Promise<HooksConfig> {
      const flags = this.flags;

      if (isHookEvent(source)) {
         this.rejectFlags(`"${source}" is a hook event`, [
            ['name', flags.name],
            ['ref', flags.ref],
         ]);

         return hooksSchema.parse({ [source]: [ this.buildMatcher() ] });
      }

      if (!SOURCE_CHARACTERS.test(source)) {
         this.error(
            `Unknown hook event "${source}".\n\nValid events: ${hookEvents.join(', ')}\n\n` +
               'To add a hook fragment instead, pass a file path, URL, or npm/git reference.',
         );
      }

      this.rejectFlags(`"${source}" is a hook fragment`, [
         ['command', flags.command],
         ['url', flags.url],
         ['prompt', flags.prompt],
         ['type', flags.type],
         ['matcher', flags.matcher],
         ['timeout', flags.timeout],
         ['description', flags.description],
      ]);

      try {
         const direct = await resolveDirectInstallConfig({
            type: 'hook',
            source,
            name: flags.name,
            ref: flags.ref,
            cwd: process.cwd(),
         });

         return direct.config.hooks ?? {};
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Failed to load hook: ${message}`);
      }
   }

   private buildMatcher(): HookMatcher {
      const { matcher, description } = this.flags;

      return {
         ...(matcher ? { matcher } : {}),
         ...(description ? { description } : {}),
         hooks: [ this.buildAction() ],
      };
   }

   private buildAction(): HookAction {
      const { command, url, prompt, type, timeout } = this.flags,
            provided = [ command, url, prompt ].filter(Boolean);

      if (provided.length === 0) {
         this.error('Provide --command, --url, or --prompt to describe what the hook runs.');
      }
      if (provided.length > 1) {
         this.error('--command, --url, and --prompt are mutually exclusive.');
      }

      const timeoutField = timeout === undefined ? {} : { timeout };

      if (url) {
         this.rejectActionType(type, '--url', 'http');
         return { type: 'http', url, ...timeoutField };
      }

      if (prompt) {
         this.rejectActionType(type, '--prompt', 'prompt', 'agent');
         return { type: type === 'agent' ? 'agent' : 'prompt', prompt, ...timeoutField };
      }

      this.rejectActionType(type, '--command', 'command');
      return { command: String(command), ...timeoutField };
   }

   private rejectActionType(
      requested: string | undefined,
      flag: string,
      inferred: string,
      alsoAllowed?: string,
   ): void {
      if (!requested || requested === inferred || requested === alsoAllowed) {
         return;
      }

      const allowed = alsoAllowed ? `${inferred} or ${alsoAllowed}` : inferred;

      this.error(`--type ${requested} cannot be used with ${flag}. Use --type ${allowed}.`);
   }

   private rejectFlags(reason: string, flags: Array<[string, unknown]>): void {
      const used = flags.filter(([ , value ]) => {
         return value !== undefined;
      });

      if (used.length === 0) {
         return;
      }

      this.error(
         `These flags cannot be used because ${reason}: ${used.map(([ name ]) => `--${name}`).join(', ')}`,
      );
   }

   /**
    * Install the added hooks. When ai.json drives the install, one call writes the whole
    * hooks section; direct installs (no ai.json, or --local) go event by event.
    */
   private async installHooks(hooks: HooksConfig, context: HookInstallContext): Promise<void> {
      const entries = Object.entries(hooks),
            installsWholeSection = Boolean(context.loaded) && !this.flags.local,
            pending = installsWholeSection ? entries.slice(0, 1) : entries;

      for (const [ event, matchers ] of pending) {
         // eslint-disable-next-line no-await-in-loop -- Sequential to keep editor writes safe
         await installAddedItem({
            logInstallResults: (results) => {
               this.logInstallResults(results);
            },
            skipInstall: this.flags['no-install'],
            loaded: context.loaded,
            local: this.flags.local,
            installSections: ['hooks'],
            itemSection: 'hooks',
            itemName: event,
            itemValue: matchers,
            scope: context.targetScope,
            projectRoot: process.cwd(),
            editors: context.targetEditors,
            failInstall: this.error.bind(this),
         });
      }
   }
}
