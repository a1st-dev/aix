import { Args, Flags } from '@oclif/core';
import { resolve } from 'pathe';
import { BaseCommand } from '../../base-command.js';
import { installAfterAdd, formatInstallResults } from '../../lib/install-helper.js';
import {
   buildGitHubUrl,
   buildProviderUrl,
   getLocalConfigPath,
   inferNameFromPath,
   isGenericGitUrl,
   isLocalPath,
   loadRule,
   parseGitHubRepoUrl,
   parseGitHubTreeUrl,
   parseGitShorthand,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { RuleValue } from '@a1st/aix-schema';
import { localFlag } from '../../flags/local.js';

type ActivationMode = 'always' | 'auto' | 'glob' | 'manual';

interface ParsedRule {
   /** The rule value (string shorthand or object) */
   value: RuleValue;
   /** Inferred name from the source path/URL */
   inferredName?: string;
}

const RULE_EXTENSIONS = ['.md', '.txt'];

/**
 * Detect source type and parse into a structured rule reference.
 * Returns a string shorthand when possible, object when metadata is needed.
 */
function parseSource(source: string, refOverride?: string): ParsedRule {
   // Local file paths - return string shorthand
   if (isLocalPath(source)) {
      return {
         value: source,
         inferredName: inferNameFromPath(source, RULE_EXTENSIONS),
      };
   }

   // GitHub web URL with /tree/branch/path
   const ghTree = parseGitHubTreeUrl(source);

   if (ghTree) {
      return {
         value: {
            git: {
               url: buildGitHubUrl(ghTree.owner, ghTree.repo),
               ref: refOverride ?? ghTree.ref,
               path: ghTree.subdir,
            },
         },
         inferredName: inferNameFromPath(ghTree.subdir),
      };
   }

   // GitHub repo URL (no tree path)
   const ghRepo = parseGitHubRepoUrl(source);

   if (ghRepo) {
      const gitRef: { url: string; ref?: string } = {
         url: buildGitHubUrl(ghRepo.owner, ghRepo.repo),
      };

      if (refOverride) {
         gitRef.ref = refOverride;
      }
      return {
         value: { git: gitRef },
         inferredName: ghRepo.repo,
      };
   }

   // Git shorthand: github:user/repo, github:user/repo/path#ref
   const shorthand = parseGitShorthand(source);

   if (shorthand) {
      const gitUrl = buildProviderUrl(shorthand.provider, shorthand.user, shorthand.repo),
            effectiveRef = refOverride ?? shorthand.ref,
            gitRefObj: { url: string; ref?: string; path?: string } = { url: gitUrl };

      if (effectiveRef) {
         gitRefObj.ref = effectiveRef;
      }
      if (shorthand.subpath) {
         gitRefObj.path = shorthand.subpath;
      }

      return {
         value: { git: gitRefObj },
         inferredName: shorthand.subpath ? inferNameFromPath(shorthand.subpath) : shorthand.repo,
      };
   }

   // Generic https git URL - return string shorthand
   if (isGenericGitUrl(source)) {
      if (refOverride) {
         return {
            value: { git: { url: source, ref: refOverride } },
            inferredName: inferNameFromPath(source.replace(/\.git$/, '')),
         };
      }
      return {
         value: source,
         inferredName: inferNameFromPath(source.replace(/\.git$/, '')),
      };
   }

   // Treat as inline rule content
   return {
      value: { content: source },
      inferredName: undefined,
   };
}

export default class AddRule extends BaseCommand<typeof AddRule> {
   static override description = 'Add a rule to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> "Always use TypeScript for new files" --name typescript-rule',
      '<%= config.bin %> <%= command.id %> ./rules/coding-standards.md --name coding-standards',
      '<%= config.bin %> <%= command.id %> https://github.com/anthropics/skills/tree/main/skills/frontend-design --name frontend',
      '<%= config.bin %> <%= command.id %> github:myorg/rules/typescript#main --name typescript',
      '<%= config.bin %> <%= command.id %> "Always use TypeScript" --name ts-rule --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Rule content, local file path, or git URL',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      name: Flags.string({
         char: 'n',
         description: 'Rule name (inferred from source if not provided)',
      }),
      description: Flags.string({
         char: 'd',
         description: 'When the rule should apply (enables auto activation)',
      }),
      activation: Flags.string({
         char: 'a',
         description: 'Activation mode',
         options: ['always', 'auto', 'glob', 'manual'],
         default: 'always',
      }),
      globs: Flags.string({
         char: 'g',
         description: 'File patterns for glob activation (comma-separated)',
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
      const { args, flags } = await this.parse(AddRule),
            loaded = await this.loadConfig(),
            parsed = parseSource(args.source, flags.ref),
            ruleName = flags.name ?? parsed.inferredName;

      if (!ruleName) {
         this.error('Could not infer rule name from source. Please provide --name.');
      }

      // Build the rule value
      let ruleValue: RuleValue = parsed.value;

      // Add metadata if provided (convert string shorthand to object if needed)
      if (flags.description || flags.activation !== 'always' || flags.globs) {
         if (typeof ruleValue === 'string') {
            // Convert string shorthand to object form
            ruleValue = { path: ruleValue };
         }
         ruleValue = { ...ruleValue, ...this.buildMetadata(flags) };
      }

      // Validate the source is accessible BEFORE updating ai.json
      // This prevents adding broken references to the config
      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      try {
         await loadRule(ruleName, ruleValue, basePath);
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Failed to load rule: ${message}`);
      }

      // Determine target file based on --local flag
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            return {
               ...config,
               rules: { ...config.rules, [ruleName]: ruleValue },
            };
         });
         this.output.success(`Added rule "${ruleName}" to ai.local.json`);
      } else {
         if (!loaded) {
            this.error(
               'No ai.json found. Run `aix init` to create one, or use --local to write to ai.local.json.',
            );
         }
         await updateConfig(loaded.path, (config) => {
            return {
               ...config,
               rules: { ...config.rules, [ruleName]: ruleValue },
            };
         });
         this.output.success(`Added rule "${ruleName}"`);

         // Auto-install to configured editors unless --no-install
         if (!flags['no-install']) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               scopes: ['rules'],
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'rule',
            name: ruleName,
            value: ruleValue,
         });
      }
   }

   private buildMetadata(flags: {
      description?: string;
      activation?: string;
      globs?: string;
   }): Partial<{ description: string; activation: ActivationMode; globs: string[] }> {
      const metadata: Partial<{
         description: string;
         activation: ActivationMode;
         globs: string[];
      }> = {};

      if (flags.description) {
         metadata.description = flags.description;
      }
      if (flags.activation && flags.activation !== 'always') {
         metadata.activation = flags.activation as ActivationMode;
      }
      if (flags.globs) {
         metadata.globs = flags.globs.split(',').map((g) => g.trim());
      }

      return metadata;
   }
}
