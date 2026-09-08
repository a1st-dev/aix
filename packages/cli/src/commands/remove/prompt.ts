import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath, trackRemoval } from '@a1st/aix-core';
import { resolveScope } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd } from '../../lib/install-helper.js';
import { getLockableConfigPath, refreshLockfileAfterRemoval } from '../../lib/lockfile-helper.js';
import { resolveRemovalEditors } from '../../lib/resolve-removal-editors.js';
import {
   computeFilesToDelete,
   deleteFiles,
   getExistingFiles,
   type FilesToDelete,
} from '../../lib/delete-helper.js';

export default class RemovePrompt extends BaseCommand<typeof RemovePrompt> {
   static override description = 'Remove a prompt/command from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> review',
      '<%= config.bin %> <%= command.id %> review --yes',
      '<%= config.bin %> <%= command.id %> review --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Prompt name to remove',
         required: true,
      }),
   };

   static override flags = {
      ...addLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...targetFlag,
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
      'no-delete': Flags.boolean({
         description: 'Skip deleting files from editors',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemovePrompt);
      const loaded = await this.loadConfig();
      const targetEditors = resolveTargetEditors(flags.target);
      const resolvedName = args.name;
      const targetScope = resolveConfigScope(
         flags as { scope?: string; user?: boolean; project?: boolean },
         loaded && !flags.local ? resolveScope(loaded.config) : undefined,
      );

      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if prompt exists in merged config (if we have one)
      if (loaded && !loaded.config.prompts?.[resolvedName]) {
         this.error(`Prompt "${args.name}" not found in configuration`);
      }

      // Compute files to delete
      const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
            editors = await resolveRemovalEditors({
               targetEditors,
               section: 'prompts',
               itemName: resolvedName,
               configuredEditors: flags.local ? undefined : loaded?.config.editors,
               scope: targetScope,
               projectRoot,
            });

      let filesToDelete: FilesToDelete[] = [],
          shouldDeleteFiles = false;

      if (!flags['no-delete'] && editors.length > 0) {
         filesToDelete = computeFilesToDelete(editors, 'prompt', resolvedName, {
            projectRoot,
            targetScope,
         });
         const existingFiles = getExistingFiles(filesToDelete);

         if (existingFiles.length > 0) {
            this.output.log('');
            this.output.log('Files to delete:');
            for (const file of existingFiles) {
               this.output.log(`  - ${file}`);
            }
            this.output.log('');
         }
      }

      // Confirm removal (covers both config and file deletion)
      if (!flags.yes) {
         const existingFiles = getExistingFiles(filesToDelete),
               hasFiles = existingFiles.length > 0,
               targetFile = flags.local ? 'ai.local.json' : 'ai.json',
               message = loaded
                  ? hasFiles
                     ? `Remove prompt "${args.name}" from ${targetFile} and delete ${existingFiles.length} file(s)?`
                     : `Remove prompt "${args.name}" from ${targetFile}?`
                  : `Remove prompt "${args.name}" from editor configs?`;

         const confirmed = await confirm({
            message,
            default: false,
         });

         if (!confirmed) {
            this.output.info('Cancelled');
            return;
         }
         shouldDeleteFiles = hasFiles;
      } else {
         shouldDeleteFiles = getExistingFiles(filesToDelete).length > 0;
      }

      const lockableConfigPath = getLockableConfigPath(flags.local, loaded?.path);

      // Update ai.json / ai.local.json if present
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [resolvedName]: _, ...remainingPrompts } = config.prompts ?? {};

            return {
               ...config,
               prompts: remainingPrompts,
            };
         });
         this.output.success(`Removed prompt "${args.name}" from ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [resolvedName]: _, ...remainingPrompts } = config.prompts ?? {};

            return {
               ...config,
               prompts: remainingPrompts,
            };
         });
         this.output.success(`Removed prompt "${args.name}"`);
      }

      const lockfilePath = await refreshLockfileAfterRemoval(flags.lock, lockableConfigPath, this.output);

      // Delete files from editors
      if (shouldDeleteFiles && filesToDelete.length > 0) {
         const deleteResults = await deleteFiles(filesToDelete);

         this.logDeleteResults(deleteResults);

         if (loaded) {
            await installAfterAdd({
               configPath: loaded.path,
               sections: ['prompts'],
               scope: targetScope,
               quiet: true,
               editors: targetEditors,
            });
         }
      }

      // Track the removal in state
      await trackRemoval(targetScope, 'prompts', resolvedName, process.cwd());

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'prompt',
            name: resolvedName,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }
}
