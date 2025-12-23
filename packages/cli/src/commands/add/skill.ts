import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import {
   buildGitHubUrl,
   buildGitLabUrl,
   buildProviderUrl,
   getLocalConfigPath,
   inferNameFromPath,
   isGenericGitUrl,
   isLocalPath,
   parseGitHubRepoUrl,
   parseGitHubTreeUrl,
   parseGitLabTreeUrl,
   parseGitShorthand,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { AiJsonConfig } from '@a1st/aix-schema';

type SkillRef = AiJsonConfig['skills'][string];

interface ParsedSource {
   type: 'local' | 'git' | 'npm';
   ref: SkillRef;
   inferredName: string;
}

/**
 * Normalize a string to a valid skill name (lowercase alphanumeric with hyphens).
 */
function normalizeSkillName(name: string): string {
   return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
}

/**
 * Detect source type and parse into a structured reference.
 */
function parseSource(source: string, refOverride?: string): ParsedSource {
   // Local paths
   if (isLocalPath(source)) {
      const name = inferNameFromPath(source) ?? 'skill';

      return {
         type: 'local',
         ref: { path: source },
         inferredName: normalizeSkillName(name),
      };
   }

   // GitHub web URL with /tree/branch/path
   const ghTree = parseGitHubTreeUrl(source);

   if (ghTree) {
      const name = inferNameFromPath(ghTree.subdir) ?? ghTree.repo;

      return {
         type: 'git',
         ref: {
            git: buildGitHubUrl(ghTree.owner, ghTree.repo),
            ref: refOverride ?? ghTree.ref,
            path: ghTree.subdir,
         },
         inferredName: normalizeSkillName(name),
      };
   }

   // GitHub repo URL (no tree path)
   const ghRepo = parseGitHubRepoUrl(source);

   if (ghRepo) {
      const gitRef: { git: string; ref?: string } = {
         git: buildGitHubUrl(ghRepo.owner, ghRepo.repo),
      };

      if (refOverride) {
         gitRef.ref = refOverride;
      }
      return {
         type: 'git',
         ref: gitRef,
         inferredName: normalizeSkillName(ghRepo.repo),
      };
   }

   // GitLab web URL with /-/tree/branch/path
   const glTree = parseGitLabTreeUrl(source);

   if (glTree) {
      const name = inferNameFromPath(glTree.subdir) ?? glTree.project;

      return {
         type: 'git',
         ref: {
            git: buildGitLabUrl(glTree.group, glTree.project),
            ref: refOverride ?? glTree.ref,
            path: glTree.subdir,
         },
         inferredName: normalizeSkillName(name),
      };
   }

   // Git shorthand: github:user/repo, github:user/repo/path#ref, gitlab:user/repo
   const shorthand = parseGitShorthand(source);

   if (shorthand) {
      const gitUrl = buildProviderUrl(shorthand.provider, shorthand.user, shorthand.repo),
            effectiveRef = refOverride ?? shorthand.ref,
            gitRefObj: { git: string; ref?: string; path?: string } = { git: gitUrl },
            name = shorthand.subpath ? (inferNameFromPath(shorthand.subpath) ?? 'skill') : shorthand.repo;

      if (effectiveRef) {
         gitRefObj.ref = effectiveRef;
      }
      if (shorthand.subpath) {
         gitRefObj.path = shorthand.subpath;
      }

      return {
         type: 'git',
         ref: gitRefObj,
         inferredName: normalizeSkillName(name),
      };
   }

   // Generic https git URL (not GitHub/GitLab web UI)
   if (isGenericGitUrl(source)) {
      const name = inferNameFromPath(source.replace(/\.git$/, '')) ?? 'skill',
            gitRefObj: { git: string; ref?: string } = { git: source };

      if (refOverride) {
         gitRefObj.ref = refOverride;
      }
      return {
         type: 'git',
         ref: gitRefObj,
         inferredName: normalizeSkillName(name),
      };
   }

   // npm package: scoped (@scope/pkg) or aix-skill-* convention or plain package name
   if (source.startsWith('@')) {
      // Scoped package: @scope/aix-skill-foo or @scope/foo
      const pkgName = source.split('/').pop() ?? source,
            stripped = pkgName.replace(/^aix-skill-/, '');

      return {
         type: 'npm',
         ref: source,
         inferredName: normalizeSkillName(stripped),
      };
   }

   // Unscoped: if it doesn't contain / or :, treat as npm
   // Convention: bare name like "typescript" means "aix-skill-typescript"
   if (!source.includes('/') && !source.includes(':')) {
      const isFullPkgName = source.startsWith('aix-skill-'),
            packageName = isFullPkgName ? source : `aix-skill-${source}`;

      return {
         type: 'npm',
         ref: packageName,
         inferredName: normalizeSkillName(source.replace(/^aix-skill-/, '')),
      };
   }

   // Fallback: treat as npm package name
   const name = inferNameFromPath(source) ?? source;

   return {
      type: 'npm',
      ref: source,
      inferredName: normalizeSkillName(name),
   };
}

export default class AddSkill extends BaseCommand<typeof AddSkill> {
   static override description = 'Add a skill to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> ./skills/custom',
      '<%= config.bin %> <%= command.id %> https://github.com/anthropics/skills/tree/main/skills/pdf',
      '<%= config.bin %> <%= command.id %> github:a1st/aix-skill-react#v2.0.0',
      '<%= config.bin %> <%= command.id %> @a1st/aix-skill-react --name react',
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
            parsed = parseSource(args.source, flags.ref),
            skillName = flags.name ?? parsed.inferredName;

      // Validate skill name
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
         this.error(
            `Invalid skill name "${skillName}". ` +
               'Must be lowercase alphanumeric with single hyphens (e.g., "pdf-processing"). ' +
               'Use --name to specify a valid name.',
         );
      }

      // Determine target file based on --local flag
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => ({
            ...config,
            skills: {
               ...config.skills,
               [skillName]: parsed.ref,
            },
         }));
         this.output.success(`Added skill "${skillName}" to ai.local.json`);
      } else {
         if (!loaded) {
            this.error(
               'No ai.json found. Run `aix init` to create one, or use --local to write to ai.local.json.',
            );
         }
         await updateConfig(loaded.path, (config) => ({
            ...config,
            skills: {
               ...config.skills,
               [skillName]: parsed.ref,
            },
         }));
         this.output.success(`Added skill "${skillName}"`);

         // Auto-install to configured editors unless --no-install
         if (!flags['no-install']) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               scopes: ['skills'],
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
            reference: parsed.ref,
         });
      }
   }
}
