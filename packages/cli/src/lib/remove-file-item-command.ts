import { Args, Flags } from '@oclif/core';
import { dirname } from 'pathe';
import {
   getLocalConfigPath,
   trackRemoval,
   updateConfig,
   updateLocalConfig,
   type ConfigSection,
   type NativeFileSection,
} from '@a1st/aix-core';
import type { AiJsonConfig } from '@a1st/aix-schema';
import { BaseCommand } from '../base-command.js';
import { configOnlyFlag } from '../flags/config-only.js';
import { removeLockFlag } from '../flags/lock.js';
import { localFlag } from '../flags/local.js';
import { configScopeFlags, resolveTargetScope } from '../flags/scope.js';
import { rejectIneffectiveSaveFlags, saveFlag } from '../flags/save.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../flags/target.js';
import { confirmAction } from './confirm.js';
import { deleteFiles, findFilesToDelete, printRemovalPreview } from './delete-helper.js';
import { installAfterAdd } from './install-helper.js';
import { getLockableConfigPath, refreshLockfileAfterRemoval } from './lockfile-helper.js';
import { resolveRemovalEditors } from './resolve-removal-editors.js';

export interface FileItemKind {
   /** The item's section in ai.json, in aix state, and in an editor import. */
   section: NativeFileSection;
   /** Singular noun for messages and JSON output. */
   noun: 'skill' | 'rule' | 'prompt' | 'agent';
   /** Sections to reinstall after the files are gone, so content derived from them is rebuilt. */
   reinstallSections: ConfigSection[];
}

function withoutEntry<C extends Partial<Record<NativeFileSection, Record<string, unknown>>>>(
   config: C,
   section: NativeFileSection,
   name: string,
): C {
   const entries = { ...config[section] };

   delete entries[name];
   return { ...config, [section]: entries };
}

/**
 * Shared flow for removing an item that editors store as its own file or directory: skills,
 * rules, prompts, and agents. A subclass only names the kind of item it removes.
 */
export abstract class RemoveFileItemCommand extends BaseCommand<typeof RemoveFileItemCommand> {
   static override args = {
      name: Args.string({
         description: 'Name of the item to remove',
         required: true,
      }),
   };

   static override flags = {
      ...removeLockFlag,
      ...localFlag,
      ...configScopeFlags,
      ...saveFlag,
      ...targetFlag,
      yes: Flags.boolean({
         char: 'y',
         description: 'Skip confirmation prompt',
         default: false,
      }),
      ...configOnlyFlag,
   };

   protected abstract readonly kind: FileItemKind;

   /** The name the item is stored under, when that can differ from what was typed. */
   protected resolveItemName(typedName: string, _config: AiJsonConfig | undefined): string {
      return typedName;
   }

   async run(): Promise<void> {
      const { args } = await this.parse(RemoveFileItemCommand),
            { flags } = this,
            { section, noun, reinstallSections } = this.kind,
            loaded = flags.save ? await this.loadConfig() : undefined,
            name = this.resolveItemName(args.name, loaded?.config),
            targetEditors = resolveTargetEditors(flags.target),
            scope = resolveTargetScope(flags, loaded?.config),
            targetFile = flags.local ? 'ai.local.json' : 'ai.json';

      rejectIneffectiveSaveFlags(flags, this.error.bind(this));
      validateTargetEditors(targetEditors, this.error.bind(this));

      if (flags.save && loaded?.config[section]?.[name] === undefined) {
         this.error(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} "${args.name}" not found in configuration`);
      }

      const projectRoot = loaded ? dirname(loaded.path) : process.cwd(),
            editors = await resolveRemovalEditors({
               targetEditors,
               section,
               itemName: name,
               configuredEditors: flags.local ? undefined : loaded?.config.editors,
               scope,
               projectRoot,
            }),
            filesToDelete = flags['config-only']
               ? []
               : await findFilesToDelete({ editors, section, name, scope, projectRoot }),
            fileCount = filesToDelete.flatMap(({ files }) => {
               return files;
            }).length;

      if (fileCount === 0 && !loaded) {
         this.output.info(`No ${noun} named "${args.name}" found at ${scope} scope in: ${editors.join(', ') || 'any editor'}`);
         return;
      }

      printRemovalPreview(this.output, filesToDelete);

      if (!flags.yes) {
         const savedSuffix = fileCount > 0 ? ` and delete ${fileCount} file(s)` : '',
               message = loaded
                  ? `Remove ${noun} "${args.name}" from ${targetFile}${savedSuffix}?`
                  : `Remove ${noun} "${args.name}" from editor configs?`;

         if (!await confirmAction(message, this.error.bind(this))) {
            this.output.info('Cancelled');
            return;
         }
      }

      if (flags.save && flags.local) {
         await updateLocalConfig(loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json', (config) => {
            return withoutEntry(config, section, name);
         });
         this.output.success(`Removed ${noun} "${args.name}" from ai.local.json`);
      } else if (flags.save && loaded) {
         await updateConfig(loaded.path, (config) => {
            return withoutEntry(config, section, name);
         });
         this.output.success(`Removed ${noun} "${args.name}"`);
      }

      const lockfilePath = await refreshLockfileAfterRemoval(
         flags.lock,
         getLockableConfigPath(flags.local, loaded?.path),
         this.output,
      );

      if (fileCount > 0) {
         this.logDeleteResults(await deleteFiles(filesToDelete));

         if (loaded) {
            await installAfterAdd({
               configPath: loaded.path,
               sections: reinstallSections,
               scope,
               quiet: true,
               editors: targetEditors,
            });
         }
      }

      await trackRemoval({ scope, section, name, projectRoot, editors: targetEditors });

      if (flags.json) {
         this.output.json({
            action: 'remove',
            type: noun,
            name,
            ...(lockfilePath && { lockfilePath }),
         });
      }
   }

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }
}
