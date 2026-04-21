import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import {
   installAfterAdd,
   installSingleItem,
   formatInstallResults,
} from '../../lib/install-helper.js';
import { parseSkillSource } from '../../lib/skill-source.js';
import { localFlag } from '../../flags/local.js';
import { configScopeFlags, resolveConfigScope } from '../../flags/scope.js';
import { getLocalConfigPath, updateConfig, updateLocalConfig } from '@a1st/aix-core';
import { resolveScope } from '@a1st/aix-schema';

export default class AddSkill extends BaseCommand<typeof AddSkill> {
   static override description = 'Add a skill to ai.json';

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
      ...localFlag,
      ...configScopeFlags,
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
      const { args, flags } = await this.parse(AddSkill),
            loaded = await this.loadConfig(),
            targetScope = resolveConfigScope(
               flags as { scope?: string; user?: boolean; project?: boolean },
               loaded && !flags.local ? resolveScope(loaded.config) : undefined,
            ),
            parsed = await parseSkillSource(args.source, flags.ref),
            skillName = flags.name ?? parsed.inferredName;

      if (!skillName) {
         this.error('Could not infer skill name from source. Please provide --name.');
      }

      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
         this.error(
            `Invalid skill name "${skillName}". ` +
               'Must be lowercase alphanumeric with single hyphens (e.g., "pdf-processing"). ' +
               'Use --name to specify a valid name.',
         );
      }

      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => ({
            ...config,
            skills: {
               ...config.skills,
               [skillName]: parsed.value,
            },
         }));
         this.output.success(`Added skill "${skillName}" to ai.local.json`);
      } else if (loaded) {
         await updateConfig(loaded.path, (config) => ({
            ...config,
            skills: {
               ...config.skills,
               [skillName]: parsed.value,
            },
         }));
         this.output.success(`Added skill "${skillName}"`);
      } else {
         this.output.info('No ai.json found — installing directly to editors');
      }

      if (!flags['no-install']) {
         if (loaded && !flags.local) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               sections: ['skills'],
               scope: targetScope,
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         } else {
            const installResult = await installSingleItem({
               section: 'skills',
               name: skillName,
               value: parsed.value,
               scope: targetScope,
               projectRoot: process.cwd(),
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'skill',
            name: skillName,
            value: parsed.value,
         });
      }
   }
}
