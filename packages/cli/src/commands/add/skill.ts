import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';
import { localFlag } from '../../flags/local.js';
import {
   buildGitHubUrl,
   buildGitLabUrl,
   buildProviderUrl,
   convertBlobToRawUrl,
   extractFrontmatter,
   getLocalConfigPath,
   inferNameFromPath,
   isGenericGitUrl,
   isLocalPath,
   parseAllFrontmatter,
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
 * Try to fetch skill name from remote SKILL.md frontmatter.
 */
async function fetchSkillNameFromRemote(url: string): Promise<string | undefined> {
   try {
      const rawUrl = convertBlobToRawUrl(url),
            response = await fetch(rawUrl);

      if (!response.ok) {
         return undefined;
      }

      const content = await response.text(),
            { frontmatter } = extractFrontmatter(content);

      if (!frontmatter) {
         return undefined;
      }

      const parsed = parseAllFrontmatter(frontmatter);

      return typeof parsed.name === 'string' ? parsed.name : undefined;
   } catch {
      return undefined;
   }
}

/**
 * Infer name from path, but if it's SKILL.md, use the parent directory name.
 */
function inferSkillName(path: string): string | undefined {
   if (path.toLowerCase().endsWith('skill.md')) {
      const segments = path.split('/').filter(Boolean);

      // Remove SKILL.md
      segments.pop();
      const parentDir = segments.pop();

      if (parentDir) {
         return parentDir;
      }
   }
   return inferNameFromPath(path, ['.md']);
}

/**
 * Detect source type and parse into a structured reference.
 */
async function parseSource(source: string, refOverride?: string): Promise<ParsedSource> {
   // Local paths
   if (isLocalPath(source)) {
      const name = inferSkillName(source) ?? 'skill';

      return {
         type: 'local',
         ref: { path: source },
         inferredName: normalizeSkillName(name),
      };
   }

   // GitHub web URL with /tree/branch/path
   const ghTree = parseGitHubTreeUrl(source);

   if (ghTree) {
      // Try to fetch name from SKILL.md in that directory
      const skillMdUrl = `${source.replace(/\/$/, '')}/SKILL.md`,
            remoteName = await fetchSkillNameFromRemote(skillMdUrl),
            name = remoteName ?? (inferSkillName(ghTree.subdir) ?? ghTree.repo);

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

   // GitHub web URL with /blob/ref/path
   const ghBlob = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);

   if (ghBlob) {
      const [, owner, repo, ref, path] = ghBlob,
            remoteName = await fetchSkillNameFromRemote(source),
            name = remoteName ?? (inferSkillName(path!) ?? repo!);

      return {
         type: 'git',
         ref: {
            git: buildGitHubUrl(owner!, repo!),
            ref: refOverride ?? ref!,
            path: path!,
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

      // Try repo root SKILL.md
      const skillMdUrl = `${source.replace(/\/$/, '')}/blob/main/SKILL.md`,
            remoteName = await fetchSkillNameFromRemote(skillMdUrl);

      return {
         type: 'git',
         ref: gitRef,
         inferredName: normalizeSkillName(remoteName ?? ghRepo.repo),
      };
   }

   // GitLab web URL with /-/tree/branch/path
   const glTree = parseGitLabTreeUrl(source);

   if (glTree) {
      const skillMdUrl = `${source.replace(/\/$/, '')}/SKILL.md`,
            remoteName = await fetchSkillNameFromRemote(skillMdUrl),
            name = remoteName ?? (inferSkillName(glTree.subdir) ?? glTree.project);

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
            name = shorthand.subpath ? (inferSkillName(shorthand.subpath) ?? 'skill') : shorthand.repo;

      if (effectiveRef) {
         gitRefObj.ref = effectiveRef;
      }
      if (shorthand.subpath) {
         gitRefObj.path = shorthand.subpath;
      }

      // Note: we don't fetch for shorthand yet to keep it simple,
      // but we could build the web URL and call fetchSkillNameFromRemote

      return {
         type: 'git',
         ref: gitRefObj,
         inferredName: normalizeSkillName(name),
      };
   }

   // Generic https git URL (not GitHub/GitLab web UI)
   if (isGenericGitUrl(source)) {
      const name = inferSkillName(source.replace(/\.git$/, '')) ?? 'skill',
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
   const name = inferSkillName(source) ?? source;

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
      const { args } = await this.parse(AddSkill),
            loaded = await this.loadConfig(),
            parsed = await parseSource(args.source, this.flags.ref),
            skillName = this.flags.name ?? parsed.inferredName;

      // Validate skill name
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
         this.error(
            `Invalid skill name "${skillName}". ` +
               'Must be lowercase alphanumeric with single hyphens (e.g., "pdf-processing"). ' +
               'Use --name to specify a valid name.',
         );
      }

      // Determine target file based on --local flag
      if (this.flags.local) {
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
         if (!this.flags['no-install']) {
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
