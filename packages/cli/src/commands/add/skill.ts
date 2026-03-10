import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import {
   getLocalConfigPath,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

interface SkillsLock {
   skills: Record<string, {
      source: string;
      sourceType: string;
      path?: string;
      ref?: string;
   }>;
}

export default class AddSkill extends BaseCommand<typeof AddSkill> {
   static override description = 'Add a skill to ai.json (powered by vercel-labs/skills)';

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> ./skills/custom',
      '<%= config.bin %> <%= command.id %> https://github.com/vercel-labs/agent-skills',
      '<%= config.bin %> <%= command.id %> vercel-labs/agent-skills --name vercel-react-best-practices',
      '<%= config.bin %> <%= command.id %> typescript --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Skill source: local path, git URL, or npm package name',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      name: Flags.string({
         char: 'n',
         description: 'Specific skill name to add from the source',
      }),
      ref: Flags.string({
         char: 'r',
         description: 'Git ref (branch, tag, commit)',
      }),
      'no-install': Flags.boolean({
         description: 'Skip installing to editors after adding',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args } = await this.parse(AddSkill),
            loaded = await this.loadConfig();

      this.output.startSpinner(`Adding skill from "${args.source}"...`);

      try {
         // Build command arguments
         const skillsArgs = ['add', args.source, '--mode', 'copy', '-y'];

         if (this.flags.name) {
            skillsArgs.push('--skill', this.flags.name);
         }
         if (this.flags.ref) {
            // Note: npx skills add doesn't seem to have a direct --ref flag yet,
            // but we can potentially append it to the source if it's a URL.
            // For now, we'll try to just pass it as is.
         }

         // Run skills CLI from node_modules
         const binPath = join(process.cwd(), 'node_modules', '.bin', 'skills');

         await execa(binPath, skillsArgs, {
            cwd: loaded ? dirname(loaded.path) : process.cwd(),
         });

         // Read skills-lock.json to see what was added
         const lockPath = join(loaded ? dirname(loaded.path) : process.cwd(), 'skills-lock.json'),
               lockContent = await readFile(lockPath, 'utf8'),
               lockData = JSON.parse(lockContent) as SkillsLock;

         // Identify the added skill(s)
         const addedSkillEntries = Object.entries(lockData.skills);

         if (addedSkillEntries.length === 0) {
            throw new Error('No skills were added to skills-lock.json');
         }

         // Update ai.json (or ai.local.json)
         const skillMap: Record<string, any> = {};

         for (const [name, info] of addedSkillEntries) {
            // Convert to aix-compatible reference format
            if (info.sourceType === 'github' || info.sourceType === 'git') {
               skillMap[name] = {
                  git: info.source.startsWith('http') ? info.source : `https://github.com/${info.source}`,
                  path: info.path,
                  ref: info.ref,
               };
            } else if (info.sourceType === 'local') {
               skillMap[name] = { path: info.source };
            } else {
               // Default to string reference (e.g. for npm or simple packages)
               skillMap[name] = info.source;
            }
         }

         if (this.flags.local) {
            const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

            await updateLocalConfig(localPath, (config) => ({
               ...config,
               skills: {
                  ...config.skills,
                  ...skillMap,
               },
            }));
         } else {
            if (!loaded) {
               throw new Error('No ai.json found. Run `aix init` to create one.');
            }
            await updateConfig(loaded.path, (config) => ({
               ...config,
               skills: {
                  ...config.skills,
                  ...skillMap,
               },
            }));
         }

         this.output.stopSpinner(true, `Successfully added ${addedSkillEntries.length} skill(s)`);

         // Auto-install to configured editors unless --no-install
         if (!this.flags['no-install']) {
            const installResult = await installAfterAdd({
               configPath: loaded?.path ?? 'ai.json',
               scopes: ['skills'],
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      } catch (error) {
         this.output.stopSpinner(false, 'Failed to add skill');
         this.error(error instanceof Error ? error.message : String(error));
      }
   }
}
