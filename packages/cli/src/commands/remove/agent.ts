import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath, trackRemoval, type EditorName } from '@a1st/aix-core';
import { normalizeEditors, resolveScope } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import { installAfterAdd } from '../../lib/install-helper.js';
import {
   computeFilesToDelete,
   deleteFiles,
   getExistingFiles,
   type FilesToDelete,
} from '../../lib/delete-helper.js';

export default class RemoveAgent extends BaseCommand<typeof RemoveAgent> {
   static override description = 'Remove an agent from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> reviewer',
      '<%= config.bin %> <%= command.id %> reviewer --yes',
      '<%= config.bin %> <%= command.id %> reviewer --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Agent name to remove',
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
      'no-delete': Flags.boolean({
         description: 'Skip deleting files from editors',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(RemoveAgent);
      const loaded = await this.loadConfig();
      const targetEditors = resolveTargetEditors(flags.target);
      const resolvedName = args.name;
      const targetScope = resolveConfigScope(
         flags as { scope?: string; user?: boolean; project?: boolean },
         loaded && !flags.local ? resolveScope(loaded.config) : undefined,
      );

      validateTargetEditors(targetEditors, this.error.bind(this));

      // Check if agent exists in merged config (if we have one)
      if (loaded && !loaded.config.agents?.[resolvedName]) {
         this.error(`Agent "${args.name}" not found in configuration`);
      }

      // Compute files to delete
      const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
            configuredEditors = loaded?.config.editors,
            editors = targetEditors ?? (configuredEditors
               ? (Object.keys(normalizeEditors(configuredEditors)) as EditorName[])
               : []);

      let filesToDelete: FilesToDelete[] = [],
          shouldDeleteFiles = false;

      if (!flags['no-delete'] && editors.length > 0) {
         filesToDelete = computeFilesToDelete(editors, 'agent', resolvedName, {
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
                     ? `Remove agent "${args.name}" from ${targetFile} and delete ${existingFiles.length} file(s)?`
                     : `Remove agent "${args.name}" from ${targetFile}?`
                  : `Remove agent "${args.name}" from editor configs?`;

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

      // Update ai.json / ai.local.json if present
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [resolvedName]: _, ...remainingAgents } = config.agents ?? {};

            return {
               ...config,
               agents: remainingAgents,
            };
         });
         this.output.success(`Removed agent "${args.name}" from ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => {
            const { [resolvedName]: _, ...remainingAgents } = config.agents ?? {};

            return {
               ...config,
               agents: remainingAgents,
            };
         });
         this.output.success(`Removed agent "${args.name}"`);
      }

      // Delete files from editors
      if (shouldDeleteFiles && filesToDelete.length > 0) {
         const deleteResults = await deleteFiles(filesToDelete);

         this.logDeleteResults(deleteResults);

         if (loaded) {
            await installAfterAdd({
               configPath: loaded.path,
               sections: ['agents'],
               scope: targetScope,
               quiet: true,
               editors: targetEditors,
            });
         }
      }

      // Track the removal in state
      await trackRemoval(targetScope, 'agents', resolvedName, process.cwd());

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'agent',
            name: resolvedName,
         });
      }
   }
}
