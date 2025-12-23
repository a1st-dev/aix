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
   loadPrompt,
   parseGitHubBlobUrl,
   parseGitHubRepoUrl,
   parseGitShorthand,
   updateConfig,
   updateLocalConfig,
} from '@a1st/aix-core';
import type { PromptValue } from '@a1st/aix-schema';
import { localFlag } from '../../flags/local.js';

interface ParsedPrompt {
   /** The prompt value (string shorthand or object) */
   value: PromptValue;
   /** Inferred name from the source path/URL */
   inferredName?: string;
}

const PROMPT_EXTENSIONS = ['.md', '.prompt.md', '.txt'];

/**
 * Detect source type and parse into a structured prompt reference.
 * Returns a string shorthand when possible, object when metadata is needed.
 */
function parseSource(source: string, refOverride?: string): ParsedPrompt {
   // Local file paths - return string shorthand
   if (isLocalPath(source)) {
      return {
         value: source,
         inferredName: inferNameFromPath(source, PROMPT_EXTENSIONS),
      };
   }

   // GitHub web URL with /blob/branch/path
   const ghBlob = parseGitHubBlobUrl(source);

   if (ghBlob) {
      return {
         value: {
            git: {
               url: buildGitHubUrl(ghBlob.owner, ghBlob.repo),
               ref: refOverride ?? ghBlob.ref,
               path: ghBlob.path,
            },
         },
         inferredName: inferNameFromPath(ghBlob.path, PROMPT_EXTENSIONS),
      };
   }

   // GitHub repo URL (no blob path)
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

   // Git shorthand: github:user/repo/path#ref
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
         inferredName: shorthand.subpath
            ? inferNameFromPath(shorthand.subpath, PROMPT_EXTENSIONS)
            : shorthand.repo,
      };
   }

   // Generic https git URL - return string shorthand
   if (isGenericGitUrl(source)) {
      if (refOverride) {
         return {
            value: { git: { url: source, ref: refOverride } },
            inferredName: inferNameFromPath(source.replace(/\.git$/, ''), PROMPT_EXTENSIONS),
         };
      }
      return {
         value: source,
         inferredName: inferNameFromPath(source.replace(/\.git$/, ''), PROMPT_EXTENSIONS),
      };
   }

   // Treat as inline prompt content
   return {
      value: { content: source },
      inferredName: undefined,
   };
}

export default class AddPrompt extends BaseCommand<typeof AddPrompt> {
   static override description = 'Add a prompt/command to ai.json';

   static override examples = [
      '<%= config.bin %> <%= command.id %> ./prompts/review.md --name review',
      '<%= config.bin %> <%= command.id %> https://github.com/org/prompts/blob/main/review.md --name review',
      '<%= config.bin %> <%= command.id %> "Review code for issues" --name review',
      '<%= config.bin %> <%= command.id %> github:myorg/prompts/code-review.md#main --name code-review',
      '<%= config.bin %> <%= command.id %> ./review.md --name review -d "Code review checklist" -a "[file]"',
      '<%= config.bin %> <%= command.id %> ./review.md --name review --no-install',
   ];

   static override args = {
      source: Args.string({
         description: 'Prompt content, local file path, or git URL',
         required: true,
      }),
   };

   static override flags = {
      ...localFlag,
      name: Flags.string({
         char: 'n',
         description: 'Prompt name (inferred from source if not provided)',
      }),
      description: Flags.string({
         char: 'd',
         description: 'Description shown in command picker',
      }),
      'argument-hint': Flags.string({
         char: 'a',
         description: 'Hint for arguments (e.g., "[file] [message]")',
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
      const { args, flags } = await this.parse(AddPrompt),
            loaded = await this.loadConfig(),
            parsed = parseSource(args.source, flags.ref),
            promptName = flags.name ?? parsed.inferredName;

      if (!promptName) {
         this.error('Could not infer prompt name from source. Please provide --name.');
      }

      // Build the prompt value
      let promptValue: PromptValue = parsed.value;

      // Add metadata if provided (convert string shorthand to object if needed)
      if (flags.description || flags['argument-hint']) {
         if (typeof promptValue === 'string') {
            // Convert string shorthand to object form
            promptValue = { path: promptValue };
         }
         if (flags.description) {
            promptValue = { ...promptValue, description: flags.description };
         }
         if (flags['argument-hint']) {
            promptValue = { ...promptValue, argumentHint: flags['argument-hint'] };
         }
      }

      // Validate the source is accessible BEFORE updating ai.json
      // This prevents adding broken references to the config
      const basePath = loaded?.path ?? resolve(process.cwd(), 'ai.json');

      try {
         await loadPrompt(promptName, promptValue, basePath);
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.error(`Failed to load prompt: ${message}`);
      }

      // Determine target file based on --local flag
      if (flags.local) {
         const localPath = loaded ? getLocalConfigPath(loaded.path) : 'ai.local.json';

         await updateLocalConfig(localPath, (config) => {
            return {
               ...config,
               prompts: { ...config.prompts, [promptName]: promptValue },
            };
         });
         this.output.success(`Added prompt "${promptName}" to ai.local.json`);
      } else {
         if (!loaded) {
            this.error(
               'No ai.json found. Run `aix init` to create one, or use --local to write to ai.local.json.',
            );
         }
         await updateConfig(loaded.path, (config) => {
            return {
               ...config,
               prompts: { ...config.prompts, [promptName]: promptValue },
            };
         });
         this.output.success(`Added prompt "${promptName}"`);

         // Auto-install to configured editors unless --no-install
         if (!flags['no-install']) {
            const installResult = await installAfterAdd({
               configPath: loaded.path,
               scopes: ['editors'], // prompts are under editors scope
            });

            if (installResult.installed) {
               this.logInstallResults(formatInstallResults(installResult.results));
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            action: 'add',
            type: 'prompt',
            name: promptName,
            value: promptValue,
         });
      }
   }
}
