import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { localFlag } from '../../flags/local.js';
import { updateConfig, updateLocalConfig, getLocalConfigPath, type EditorName } from '@a1st/aix-core';
import { normalizeEditors } from '@a1st/aix-schema';
import { confirm } from '@inquirer/prompts';
import {
   computeFilesToDelete,
   deleteFiles,
   getExistingFiles,
   type FilesToDelete,
} from '../../lib/delete-helper.js';

export default class RemoveSkill extends BaseCommand<typeof RemoveSkill> {
   static override description = 'Remove a skill from ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> react --yes',
      '<%= config.bin %> <%= command.id %> react --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Skill name to remove',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
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
      const { args, flags } = await this.parse(RemoveSkill);
      const loaded = await this.loadConfig();

      // Check if skill exists in merged config
      if (!loaded?.config.skills?.[args.name]) {
         this.error(`Skill "${args.name}" not found in configuration`);
      }

      // Compute files to delete
      const projectRoot = dirname(loaded.path),
            configuredEditors = loaded.config.editors,
            editors = configuredEditors
               ? (Object.keys(normalizeEditors(configuredEditors)) as EditorName[])
               : [];

      let filesToDelete: FilesToDelete[] = [],
          shouldDeleteFiles = false;

      if (!flags['no-delete'] && editors.length > 0) {
         filesToDelete = computeFilesToDelete(editors, 'skill', args.name, projectRoot);
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
               message = hasFiles
                  ? `Remove skill "${args.name}" from ${targetFile} and delete ${existingFiles.length} file(s)?`
                  : `Remove skill "${args.name}" from ${targetFile}?`;

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

      // Determine target file based on --local flag
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            const { [args.name]: _, ...remainingSkills } = config.skills ?? {};

            return {
               ...config,
               skills: remainingSkills,
            };
         });
         this.output.success(`Removed skill "${args.name}" from ai.local.json`);
      } else {
         if (!loaded) {
            this.error('No ai.json found. Use --local to modify ai.local.json instead.');
         }
         await updateConfig(loaded.path, (config) => {
            const { [args.name]: _, ...remainingSkills } = config.skills ?? {};

            return {
               ...config,
               skills: remainingSkills,
            };
         });
         this.output.success(`Removed skill "${args.name}"`);

         // Delete files from editors
         if (shouldDeleteFiles && filesToDelete.length > 0) {
            const deleteResults = await deleteFiles(filesToDelete);

            this.logDeleteResults(deleteResults);
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'remove',
            type: 'skill',
            name: args.name,
         });
      }
   }
}
