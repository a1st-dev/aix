import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { saveFlag } from '../../flags/save.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import {
   getLocalConfigPath,
   removeHookFromEditors,
   trackRemoval,
   updateConfig,
   updateLocalConfig,
   type EditorName,
} from '@a1st/aix-core';
import {
   hookEvents,
   isHookEvent,
   type HookEvent,
   type HooksConfig,
} from '@a1st/aix-schema';
import { getLockableConfigPath, refreshLockfileAfterRemoval } from '../../lib/lockfile-helper.js';
import { resolveRemovalEditors } from '../../lib/resolve-removal-editors.js';
import { confirm } from '@inquirer/prompts';
import { printEditorRemovalPreview } from '../../lib/delete-helper.js';

export default class RemoveHook extends BaseCommand<typeof RemoveHook> {
   static override description = 'Remove a lifecycle hook';

   static override examples = [
      '<%= config.bin %> <%= command.id %> pre_command',
      '<%= config.bin %> <%= command.id %> pre_command --yes',
      '<%= config.bin %> <%= command.id %> session_start --user --target claude-code',
      '<%= config.bin %> <%= command.id %> pre_command --no-sync',
   ];

   static override args = {
      event: Args.string({
         description: 'Hook event to remove',
         required: true,
      }),
   };

   static override flags = {
      ...addLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...saveFlag,
      ...targetFlag,
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
      'no-sync': Flags.boolean({
         description: 'Skip removing the hook from editor configs',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemoveHook),
            loaded = flags.save ? await this.loadConfig() : undefined,
            targetEditors = resolveTargetEditors(flags.target),
            targetScope = resolveConfigScope(flags);

      validateTargetEditors(targetEditors, this.error.bind(this));

      if (!isHookEvent(args.event)) {
         this.error(`Unknown hook event "${args.event}".\n\nValid events: ${hookEvents.join(', ')}`);
      }

      const event: HookEvent = args.event;

      if (flags.save && (!loaded || !loaded.config.hooks?.[event])) {
         this.error(`Hook event "${event}" not found in configuration`);
      }

      const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
            editors = await resolveRemovalEditors({
               targetEditors,
               section: 'hooks',
               itemName: event,
               configuredEditors: loaded?.config.editors,
               scope: targetScope,
               projectRoot,
            });

      printEditorRemovalPreview({ output: this.output, editors, itemType: 'hook', itemName: event, scope: targetScope });

      if (!flags.yes && !await this.confirmRemoval(event, Boolean(loaded), flags.local)) {
         return;
      }

      const lockableConfigPath = getLockableConfigPath(flags.local, loaded?.path);

      if (flags.save && flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            return { ...config, hooks: removeEvent(config.hooks, event) };
         });
         this.output.success(`Removed hook "${event}" from ai.local.json`);
      } else if (flags.save && loaded) {
         await updateConfig(loaded.path, (config) => {
            return { ...config, hooks: removeEvent(config.hooks, event) };
         });
         this.output.success(`Removed hook "${event}"`);
      }

      const lockfilePath = await refreshLockfileAfterRemoval(flags.lock, lockableConfigPath, this.output);

      if (!flags['no-sync']) {
         await this.removeFromEditorConfigs(editors, event, projectRoot, targetScope);
      }

      await trackRemoval(targetScope, 'hooks', event, process.cwd());

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'hook',
            event,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   private async confirmRemoval(
      event: HookEvent,
      hasConfig: boolean,
      local: boolean,
   ): Promise<boolean> {
      const targetFile = local ? 'ai.local.json' : 'ai.json',
            confirmed = await confirm({
               message: hasConfig
                  ? `Remove hook "${event}" from ${targetFile} and every matching entry in your editor configs?`
                  : `Remove every "${event}" entry from your editor configs?`,
               default: false,
            });

      if (!confirmed) {
         this.output.info('Cancelled');
      }

      return confirmed;
   }

   private async removeFromEditorConfigs(
      editors: readonly EditorName[],
      event: HookEvent,
      projectRoot: string,
      targetScope: 'project' | 'user',
   ): Promise<void> {
      if (editors.length === 0) {
         this.output.info(
            'No editors detected, so no editor hook config was changed. ' +
               'Use --target <editor> to name one.',
         );
         return;
      }

      const results = await removeHookFromEditors(editors, event, projectRoot, { targetScope });

      for (const result of results) {
         if (!result.success) {
            this.output.error(
               `Failed to remove "${event}" from ${result.editor}: ${result.errors.join(', ')}`,
            );
            continue;
         }

         if (result.unsupported) {
            this.output.warn(`${result.editor} does not support hooks, so it had nothing to remove.`);
            continue;
         }

         if (result.unsupportedScope) {
            this.output.warn(
               `${result.editor} has no ${targetScope}-scope hooks config file, so it had nothing to remove.`,
            );
            continue;
         }

         if (result.removed) {
            const entries = result.removedCount === 1 ? 'entry' : 'entries';

            this.output.success(
               `Removed ${result.removedCount} ${entries} for "${event}" from ${result.editor} hooks config`,
            );
         }
      }
   }
}

/**
 * Drop one event from a hooks config, returning undefined when nothing is left so the
 * empty `hooks` key does not linger in ai.json.
 */
function removeEvent(hooks: HooksConfig | undefined, event: HookEvent): HooksConfig | undefined {
   const { [event]: _removed, ...remaining } = hooks ?? {};

   return Object.keys(remaining).length > 0 ? remaining : undefined;
}
