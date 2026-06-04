import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { getLockableConfigPath } from '../../lib/lockfile-helper.js';
import { parseSkillSource } from '../../lib/skill-source.js';
import { addLockFlag } from '../../flags/lock.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../../flags/target.js';
import { updateConfig, updateLocalConfig } from '@a1st/aix-core';
import { resolveScope, type AiJsonConfig } from '@a1st/aix-schema';
import {
   getAddSources,
   installAddedItem,
   persistAddedItem,
   rejectMultiSourceFlags,
   refreshLockfileAfterAdd,
} from '../../lib/add-command-helper.js';

export default class AddSkill extends BaseCommand<typeof AddSkill> {
   static override description = 'Add a skill to ai.json';
   static override strict = false;

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> ./skills/custom',
      '<%= config.bin %> <%= command.id %> https://github.com/anthropics/skills/tree/main/skills/pdf',
      '<%= config.bin %> <%= command.id %> vercel-labs/agent-skills/frontend-design',
      '<%= config.bin %> <%= command.id %> github:a1st/aix-skill-react#v2.0.0',
      '<%= config.bin %> <%= command.id %> typescript --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Skill source: local path, git URL, git shorthand, or npm package name',
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
         description: 'Override inferred skill name',
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
      const { args, flags, argv } = await this.parse(AddSkill),
            loaded = await this.loadConfig(),
            targetScope = resolveConfigScope(
               flags as { scope?: string; user?: boolean; project?: boolean },
               loaded && !flags.local ? resolveScope(loaded.config) : undefined,
            ),
            lockableConfigPath = getLockableConfigPath(loaded),
            sources = getAddSources(args, argv),
            targetEditors = resolveTargetEditors(flags.target);

      if (flags.lock && !lockableConfigPath) {
         this.error('--lock requires a local ai.json. Run `aix init` first, or omit --lock.');
      }
      validateTargetEditors(targetEditors, this.error.bind(this));
      rejectMultiSourceFlags({
         sources,
         flags,
         disallowedFlags: ['name', 'ref'],
         error: this.error.bind(this),
      });

      const addedItems = await sources.reduce<Promise<Array<{ name: string; value: AiJsonConfig['skills'][string] }>>>(
         async (memoPromise, source) => {
            const memo = await memoPromise,
                  parsed = await parseSkillSource(source, flags.ref),
                  skillName = flags.name ?? parsed.inferredName;

            if (!skillName) {
               this.error(`Could not infer skill name from source "${source}". Please provide --name.`);
            }

            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
               this.error(
                  `Invalid skill name "${skillName}". ` +
                  'Must be lowercase alphanumeric with single hyphens (e.g., "pdf-processing"). ' +
                  'Use --name to specify a valid name.',
               );
            }

            await persistAddedItem({
               loaded,
               local: flags.local,
               output: this.output,
               localSuccessMessage: `Added skill "${skillName}" to ai.local.json`,
               projectSuccessMessage: `Added skill "${skillName}"`,
               saveLocal: async (localPath) => {
                  await updateLocalConfig(localPath, (config) => ({
                     ...config,
                     skills: {
                        ...config.skills,
                        [skillName]: parsed.value,
                     },
                  }));
               },
               saveProject: async (configPath) => {
                  await updateConfig(configPath, (config) => ({
                     ...config,
                     skills: {
                        ...config.skills,
                        [skillName]: parsed.value,
                     },
                  }));
               },
            });

            memo.push({ name: skillName, value: parsed.value });

            if (!loaded || flags.local) {
               await installAddedItem({
                  logInstallResults: (results) => {
                     this.logInstallResults(results);
                  },
                  skipInstall: flags['no-install'],
                  loaded,
                  local: flags.local,
                  installSections: ['skills'],
                  itemSection: 'skills',
                  itemName: skillName,
                  itemValue: parsed.value,
                  scope: targetScope,
                  projectRoot: process.cwd(),
                  editors: targetEditors,
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
            installSections: ['skills'],
            itemSection: 'skills',
            itemName: firstItem.name,
            itemValue: firstItem.value,
            scope: targetScope,
            projectRoot: process.cwd(),
            editors: targetEditors,
         });
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'skill',
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
}
