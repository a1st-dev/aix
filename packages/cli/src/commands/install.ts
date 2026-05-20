import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Args, Flags } from '@oclif/core';
import { dirname, join } from 'pathe';
import { select, confirm } from '@inquirer/prompts';
import { parseConfig, normalizeEditors, parseJsonc, resolveScope, type AiJsonConfig, type ConfigScope } from '@a1st/aix-schema';
import { BaseCommand } from '../base-command.js';
import {
   displayFileChanges,
   displayGlobalChanges,
   showUnsupportedFeatureWarnings,
} from '../lib/apply-result-reporter.js';
import { ConfigParseError, generateAndWriteLockfile } from '@a1st/aix-core';
import { onlyFlag, parseSections, configScopeFlags, resolveConfigScope } from '../flags/scope.js';
import { resolveTargetEditors, targetFlag, validateTargetEditors } from '../flags/target.js';
import { resolveMcpFromRegistry } from '../lib/add-command-helper.js';
import {
   installToEditor,
   detectEditors,
   updateConfig,
   loadConfig,
   createBackup,
   mergeConfigs,
   filterConfigBySections,
   cleanStaleCache,
   localizeRemoteConfig,
   commitImport,
   rollbackImport,
   convertToGitReferences,
   type EditorName,
   type ApplyResult,
   type LoadedConfig,
   type ConfigSection,
   type GitSourceInfo,
   resolveDirectInstallConfig,
   redactDirectInstallConfig,
   type DirectInstallType,
} from '@a1st/aix-core';

export default class Install extends BaseCommand<typeof Install> {
   static override aliases = ['i'];

   static override description = 'Install configuration to editors';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> https://github.com/org/repo/blob/main/ai.json',
      '<%= config.bin %> <%= command.id %> github:org/shared-config',
      '<%= config.bin %> <%= command.id %> ./configs/team-config.json',
      '<%= config.bin %> <%= command.id %> --target windsurf',
      '<%= config.bin %> <%= command.id %> -t cursor -t windsurf',
      '<%= config.bin %> <%= command.id %> --dry-run',
      '<%= config.bin %> <%= command.id %> --only mcp',
      '<%= config.bin %> <%= command.id %> playwright --type mcp --target claude-code --user',
      '<%= config.bin %> <%= command.id %> ./skills/review --type skill --target claude-code --user',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save --overwrite',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save --only mcp --only rules',
   ];

   static override args = {
      source: Args.string({
         description:
            'Config source: URL, git shorthand (github:org/repo), or local path. If omitted, uses local ai.json.',
         required: false,
      }),
   };

   static override flags = {
      ...onlyFlag,
      ...configScopeFlags,
      ...targetFlag,
      type: Flags.string({
         description: 'Install one direct artifact without a local ai.json',
         options: ['mcp', 'skill', 'rule', 'hook', 'prompt'],
      }),
      name: Flags.string({
         char: 'n',
         description: 'Name for direct installs when it cannot be inferred',
      }),
      ref: Flags.string({
         char: 'r',
         description: 'Git ref for direct install sources',
      }),
      command: Flags.string({
         description: 'MCP command for direct MCP installs',
      }),
      args: Flags.string({
         description: 'Command arguments for direct MCP installs (comma-separated)',
      }),
      env: Flags.string({
         description: 'Environment variables for direct MCP installs (KEY=value,KEY2=value2)',
      }),
      url: Flags.string({
         description: 'Remote Streamable HTTP MCP URL for direct MCP installs',
      }),
      header: Flags.string({
         description: 'HTTP header for direct remote MCP installs (repeatable KEY=value)',
         multiple: true,
      }),
      description: Flags.string({
         description: 'Rule or prompt description for direct installs',
      }),
      activation: Flags.string({
         description: 'Rule activation mode for direct rule installs',
         options: ['always', 'auto', 'glob', 'manual'],
      }),
      globs: Flags.string({
         description: 'Rule glob patterns for direct rule installs (comma-separated)',
      }),
      'argument-hint': Flags.string({
         description: 'Prompt argument hint for direct prompt installs',
      }),
      'dry-run': Flags.boolean({
         char: 'd',
         description: 'Preview changes without applying',
         default: false,
      }),
      save: Flags.boolean({
         description: 'Save remote config to local ai.json (creates or merges)',
         default: false,
      }),
      overwrite: Flags.boolean({
         description: 'Overwrite existing local ai.json instead of merging (only with --save)',
         default: false,
      }),
      clean: Flags.boolean({
         description: 'Remove .aix folder before installing to ensure exact match with ai.json',
         default: false,
      }),
      copy: Flags.boolean({
         description: 'Copy files to .aix/imported/ instead of using git references (with --save)',
         default: false,
      }),
      lock: Flags.boolean({
         description: 'Create or refresh ai.lock.json before installing',
         default: false,
      }),
   };

   protected override getLockfileMode(): 'auto' | 'ignore' {
      return this.flags.lock ? 'ignore' : 'auto';
   }

   async run(): Promise<void> {
      const { args } = await this.parse(Install);

      if (this.flags.type) {
         await this.runDirectInstall(args.source);
         return;
      }

      // Load config from source argument or fall back to local discovery
      let loaded: LoadedConfig;

      if (args.source) {
         if (this.flags.lock && !this.flags.save) {
            this.error('--lock with a remote source requires --save so aix has a local ai.json to lock');
         }

         const result = await loadConfig({
            remoteSource: args.source,
            lockfileMode: this.flags.lock ? 'ignore' : 'auto',
         });

         if (!result) {
            this.error(`Could not load config from: ${args.source}`);
         }
         loaded = result;
      } else {
         loaded = await this.requireConfig();
      }

      const sections = parseSections(this.flags as { only?: string[] }),
            projectRoot = args.source ? process.cwd() : dirname(loaded.path),
            isSaveMode = this.flags.save,
            isDryRun = this.flags['dry-run'];

      // Resolve target scope: CLI flags override ai.json scope
      const flagScope = resolveConfigScope(this.flags as { scope?: string; user?: boolean; project?: boolean }, undefined),
            targetScope: ConfigScope = flagScope ?? resolveScope(loaded.config);

      if (flagScope) {
         this.output.info(`Scope override: installing to ${targetScope} scope`);
      }

      // When installing from a remote source, check local ai.json for editor preferences
      let localEditors: AiJsonConfig['editors'] | undefined;

      if (args.source) {
         const localConfigPath = join(projectRoot, 'ai.json');

         if (existsSync(localConfigPath)) {
            const localLoaded = await loadConfig({
               explicitPath: localConfigPath,
               lockfileMode: this.flags.lock ? 'ignore' : 'auto',
            });

            localEditors = localLoaded?.config.editors;
         }
      }

      // Handle --save flag: save remote config to local ai.json
      if (isSaveMode) {
         if (!args.source) {
            this.error('--save requires a remote source argument (URL, git shorthand, or path)');
         }

         await this.saveRemoteConfig({
            remoteConfig: loaded.config,
            sections: sections as ConfigSection[],
            overwrite: this.flags.overwrite,
            dryRun: isDryRun,
            configBaseDir: loaded.configBaseDir,
            gitSource: loaded.gitSource,
            forceCopy: this.flags.copy,
         });

         // After saving, reload the local config for installation (it now has git refs or local paths)
         if (!isDryRun) {
            const localLoaded = await loadConfig({
               explicitPath: join(projectRoot, 'ai.json'),
               lockfileMode: this.flags.lock ? 'ignore' : 'auto',
            });

            if (localLoaded) {
               loaded = localLoaded;
            }
         }

         // If only saving (no editor installation needed), we're done
         if (!this.flags.target && !loaded.config.editors) {
            if (this.flags.lock && !isDryRun) {
               await this.updateLockfile(loaded, projectRoot);
            }
            return;
         }
      }

      if (this.flags.lock && !isDryRun) {
         loaded = await this.updateLockfile(loaded, projectRoot);
      }

      // Resolve which editors to install to (prefer local editors config over remote)
      const resolved = await this.resolveEditors(loaded.config, projectRoot, localEditors);

      if (!resolved) {
         return;
      }

      const { editors, shouldPromptToSave } = resolved;

      // Install to editors sequentially to avoid overwhelming the system with concurrent file I/O
      // and to provide clear sequential output to the user
      const results: ApplyResult[] = [];

      for (const editor of editors) {
         // eslint-disable-next-line no-await-in-loop -- Sequential for user feedback and file safety
         const result = await this.installToSingleEditor(editor, loaded.config, projectRoot, {
            isDryRun,
            sections,
            clean: this.flags.clean,
            configBaseDir: loaded.configBaseDir,
            targetScope,
         });

         results.push(result);
      }

      // After successful installation, clean stale cache entries
      const allSucceeded = results.every((r) => r.success);

      if (allSucceeded && !isDryRun) {
         const cleanup = await cleanStaleCache(projectRoot, {
            maxCacheAgeDays: loaded.config.aix?.cache?.maxCacheAgeDays ?? 7,
            maxBackupAgeDays: loaded.config.aix?.cache?.maxBackupAgeDays ?? 30,
         });

         if (cleanup.deletedPaths.length > 0 && !this.flags.quiet) {
            this.output.info(`Cleaned ${cleanup.deletedPaths.length} stale cache entries`);
         }
      }

      // After successful installation, prompt to save editor to ai.json
      if (shouldPromptToSave && allSucceeded && !isDryRun && editors.length === 1) {
         const editor = editors[0] as EditorName,
               localConfigPath = join(projectRoot, 'ai.json'),
               localConfigExists = existsSync(localConfigPath),
               saveToConfig = await confirm({
                  message: `Save "${editor}" as the default editor in ai.json?`,
                  default: true,
               });

         if (saveToConfig) {
            if (!localConfigExists) {
               const createConfig = await confirm({
                  message: 'No ai.json found. Create one?',
                  default: true,
               });

               if (createConfig) {
                  // When installing from a remote source, persist it as extends so future
                  // `aix i` (without a source argument) can re-fetch the config.
                  const newConfig: Record<string, unknown> = {
                     ...(args.source && { extends: args.source }),
                     editors: { [editor]: { enabled: true } },
                  };

                  await writeFile(localConfigPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');
                  this.output.success(`Created ./ai.json with "${editor}" as the default editor.`);
               }
            } else {
               await updateConfig(localConfigPath, (config) => ({
                  ...config,
                  editors: {
                     ...config.editors,
                     [editor]: { enabled: true },
                  },
               }));
               this.output.success(
                  `Added "${editor}" to ai.json. Future installs will target this editor.`,
               );
            }
         }

         if (this.flags.lock) {
            const reloaded = await loadConfig({
               explicitPath: localConfigPath,
               lockfileMode: 'ignore',
            });

            if (reloaded) {
               loaded = await this.updateLockfile(reloaded, projectRoot);
            }
         }
      }

      if (this.flags.json) {
         this.output.json({
            dryRun: isDryRun,
            sections,
            results,
         });
      }
   }

   private parseList(value: string | undefined): string[] | undefined {
      if (!value) {
         return undefined;
      }

      const values = value.split(',').map((entry) => entry.trim()).filter(Boolean);

      return values.length > 0 ? values : undefined;
   }

   private parseKeyValueMap(value: string | undefined, flagName: string): Record<string, string> | undefined {
      if (!value) {
         return undefined;
      }

      const map: Record<string, string> = {};

      for (const entry of value.split(',')) {
         const idx = entry.indexOf('=');

         if (idx === -1) {
            this.error(`${flagName} entries must use KEY=value format`);
         }

         const key = entry.slice(0, idx).trim(),
               entryValue = entry.slice(idx + 1).trim();

         if (!key) {
            this.error(`${flagName} entries must include a key`);
         }
         map[key] = entryValue;
      }

      return Object.keys(map).length > 0 ? map : undefined;
   }

   private parseHeaders(values: string[] | undefined): Record<string, string> | undefined {
      if (!values || values.length === 0) {
         return undefined;
      }

      const map: Record<string, string> = {};

      for (const entry of values) {
         const idx = entry.indexOf('=');

         if (idx === -1) {
            this.error('--header entries must use KEY=value format');
         }

         const key = entry.slice(0, idx).trim(),
               value = entry.slice(idx + 1).trim();

         if (!key) {
            this.error('--header entries must include a key');
         }
         map[key] = value;
      }

      return map;
   }

   private isRegistryMcpSource(source: string | undefined): source is string {
      return Boolean(
         source &&
         !source.startsWith('@') &&
         !source.startsWith('npm:') &&
         !source.startsWith('./') &&
         !source.startsWith('../') &&
         !source.startsWith('/') &&
         !source.startsWith('file:') &&
         !source.startsWith('http://') &&
         !source.startsWith('https://') &&
         !source.startsWith('github:') &&
         !source.startsWith('gitlab:') &&
         !source.startsWith('bitbucket:') &&
         !source.includes('/'),
      );
   }

   private getDirectInstallSections(type: DirectInstallType, sections: readonly string[]): ConfigSection[] {
      if (sections.length === 0) {
         switch (type) {
            case 'hook':
               return ['hooks'];
            case 'skill':
               return ['skills'];
            case 'prompt':
               return ['prompts'];
            case 'rule':
               return ['rules'];
            case 'mcp':
               return ['mcp'];
         }
      }

      return sections.map((section) => section as ConfigSection);
   }

   private collectSensitiveValues(value: unknown): string[] {
      if (Array.isArray(value)) {
         return value.flatMap((entry) => this.collectSensitiveValues(entry));
      }
      if (typeof value !== 'object' || value === null) {
         return [];
      }

      const record = value as Record<string, unknown>,
            values: string[] = [];

      for (const [key, entry] of Object.entries(record)) {
         if ((key === 'env' || key === 'headers') && typeof entry === 'object' && entry !== null) {
            values.push(
               ...Object.values(entry as Record<string, unknown>).filter((item): item is string => {
                  return typeof item === 'string' && item.length > 0;
               }),
            );
         } else {
            values.push(...this.collectSensitiveValues(entry));
         }
      }

      return values;
   }

   private redactString(value: string, sensitiveValues: readonly string[]): string {
      let redacted = value;

      for (const sensitiveValue of sensitiveValues) {
         redacted = redacted.split(sensitiveValue).join('<redacted>');
      }

      return redacted;
   }

   private redactDirectResults(results: ApplyResult[], config: AiJsonConfig): ApplyResult[] {
      const sensitiveValues = this.collectSensitiveValues(config);

      if (sensitiveValues.length === 0) {
         return results;
      }

      return results.map((result) => ({
         ...result,
         changes: result.changes.map((change) => ({
            ...change,
            ...(change.content ? { content: this.redactString(change.content, sensitiveValues) } : {}),
         })),
      }));
   }

   private async runDirectInstall(source: string | undefined): Promise<void> {
      const type = this.flags.type as DirectInstallType,
            isDryRun = this.flags['dry-run'],
            editors = resolveTargetEditors(this.flags.target) ?? [],
            targetScope = resolveConfigScope(
               this.flags as { scope?: string; user?: boolean; project?: boolean },
               'project',
            );

      if (this.flags.lock) {
         this.error('--lock requires a local ai.json and cannot be used with direct installs');
      }
      if (this.flags.save) {
         this.error('--save cannot be used with direct installs');
      }
      if (this.flags.only && this.flags.only.length > 0) {
         this.error('--only cannot be used with direct installs; use --type to choose the artifact');
      }
      if (editors.length === 0) {
         this.error('Direct installs require --target <editor>');
      }

      validateTargetEditors(editors, this.error.bind(this));

      const registryMcp = type === 'mcp' &&
            !this.flags.command &&
            !this.flags.url &&
            this.isRegistryMcpSource(source)
         ? await resolveMcpFromRegistry(source)
         : undefined;

      const direct = await resolveDirectInstallConfig({
               type,
               source: registryMcp ? undefined : source,
               name: this.flags.name ?? registryMcp?.name,
               ref: this.flags.ref,
               cwd: process.cwd(),
               mcp: {
                  serverConfig: registryMcp?.config,
                  command: this.flags.command,
                  args: this.parseList(this.flags.args),
                  env: this.parseKeyValueMap(this.flags.env, '--env'),
                  url: this.flags.url,
                  headers: this.parseHeaders(this.flags.header),
               },
               rule: {
                  description: this.flags.description,
                  activation: this.flags.activation as 'always' | 'auto' | 'glob' | 'manual' | undefined,
                  globs: this.parseList(this.flags.globs),
               },
               prompt: {
                  description: this.flags.description,
                  argumentHint: this.flags['argument-hint'],
               },
            }),
            sections = this.getDirectInstallSections(type, direct.sections),
            results: ApplyResult[] = [];

      for (const editor of editors) {
         // eslint-disable-next-line no-await-in-loop -- Sequential for user feedback and file safety
         const result = await this.installToSingleEditor(editor, direct.config, process.cwd(), {
            isDryRun,
            sections,
            clean: this.flags.clean,
            targetScope,
         });

         results.push(result);
      }

      if (this.flags.json) {
         this.output.json({
            dryRun: isDryRun,
            directInstall: {
               type,
               name: direct.name,
               sections,
               ...(isDryRun ? { transientConfig: redactDirectInstallConfig(direct.config) } : {}),
            },
            results: isDryRun ? this.redactDirectResults(results, direct.config) : results,
         });
      }
   }

   private async updateLockfile(loaded: LoadedConfig, projectRoot: string): Promise<LoadedConfig> {
      const written = await generateAndWriteLockfile({
         config: loaded.config,
         configPath: loaded.path,
         configBaseDir: loaded.configBaseDir,
         projectRoot,
      });

      this.output.success(`Updated ${written.lockfilePath}`);

      return {
         ...loaded,
         lockfilePath: written.lockfilePath,
         lockfile: written.lockfile,
      };
   }

   /**
    * Resolve which editors to install to based on flags, config, and detection.
    * @param config - The config being installed (may be remote)
    * @param projectRoot - The project root directory
    * @param localEditors - Optional local ai.json editors config (takes precedence over remote)
    */
   private async resolveEditors(
      config: AiJsonConfig,
      projectRoot: string,
      localEditors?: AiJsonConfig['editors'],
   ): Promise<{ editors: EditorName[]; shouldPromptToSave: boolean } | null> {
      let editors: EditorName[] = [];
      let shouldPromptToSave = false;

      if (this.flags.target && this.flags.target.length > 0) {
         editors = resolveTargetEditors(this.flags.target) ?? [];
         validateTargetEditors(editors, this.error.bind(this));
      } else {
         // Prefer local editors config over remote config's editors
         const configEditors = localEditors ?? config.editors;

         if (configEditors) {
            const normalized = normalizeEditors(configEditors);

            editors = Object.keys(normalized) as EditorName[];
         }

         if (editors.length === 0) {
            const detected = await detectEditors(projectRoot);

            if (detected.length === 0) {
               this.output.warn('No editors detected.');
               this.output.log(this.output.dim('  Hint: Run `aix install --target <editor>` to target an editor not listed'));
               return null;
            }
            if (detected.length === 1) {
               editors = detected;
               this.output.info(`Detected editor: ${detected[0]}`);
               shouldPromptToSave = true;
            } else {
               const selectedEditor = await select<EditorName>({
                  message: 'Multiple editors detected. Which one should aix install to?',
                  choices: detected.map((e) => ({ name: e, value: e })),
               });

               editors = [selectedEditor];
               shouldPromptToSave = true;
            }
         }
      }

      if (editors.length === 0) {
         this.output.warn('No editors found.');
         this.output.log(this.output.dim('  Hint: Run `aix install --target <editor>` to target an editor not listed'));
         return null;
      }

      return { editors, shouldPromptToSave };
   }

   /**
    * Install to a single editor and handle output.
    */
   private async installToSingleEditor(
      editor: EditorName,
      config: AiJsonConfig,
      projectRoot: string,
      options: { isDryRun: boolean; sections: ConfigSection[]; clean?: boolean; configBaseDir?: string; targetScope?: ConfigScope },
   ): Promise<ApplyResult> {
      const { isDryRun, sections, clean, configBaseDir, targetScope } = options;

      this.output.startSpinner(isDryRun ? `Analyzing ${editor}...` : `Installing to ${editor}...`);

      try {
         const result = await installToEditor(editor, config, projectRoot, {
            dryRun: isDryRun,
            scopes: sections,
            overwrite: this.flags.overwrite,
            clean,
            configBaseDir,
            targetScope,
         });

         this.handleInstallResult(editor, result, isDryRun);
         return result;
      } catch (error) {
         this.output.stopSpinner(false, `Failed to install to ${editor}`);
         const message = error instanceof Error ? error.message : String(error);

         this.output.error(message);
         return { editor, success: false, changes: [], errors: [message] };
      }
   }

   /**
    * Handle the result of installing to an editor.
    */
   private handleInstallResult(
      editor: EditorName,
      result: ApplyResult,
      isDryRun: boolean,
   ): void {
      const hasLocalChanges = result.changes.length > 0,
            hasGlobalChanges = Boolean(
               result.globalChanges
               && (result.globalChanges.applied.length > 0 || result.globalChanges.skipped.length > 0),
            );

      if (isDryRun) {
         this.output.stopSpinner(true, `Changes for ${editor}:`);
         if (!hasLocalChanges && !hasGlobalChanges) {
            this.output.info('No changes needed (no rules or MCP servers configured)');
         } else {
            if (hasLocalChanges) {
               displayFileChanges({
                  output: this.output,
                  quiet: this.flags.quiet,
                  changes: result.changes,
                  showAction: true,
                  blankBeforeEachCategory: true,
                  blankAfterEachCategory: true,
               });
            }
            displayGlobalChanges({
               output: this.output,
               quiet: this.flags.quiet,
               globalChanges: result.globalChanges,
               blankBeforeEachGroup: true,
               blankAfterEachGroup: false,
               finalBlank: true,
            });
         }
         showUnsupportedFeatureWarnings(this.output, this.flags.quiet, editor, result.unsupportedFeatures);
         return;
      }

      if (!result.success) {
         this.output.stopSpinner(false, `Failed to install to ${editor}`);
         for (const err of result.errors) {
            this.output.error(err);
         }
         return;
      }

      if (!hasLocalChanges && !hasGlobalChanges) {
         this.output.stopSpinner(
            true,
            `Nothing to install for ${editor} (no rules or MCP servers configured)`,
         );
         return;
      }

      this.output.stopSpinner(true, `Installed to ${editor}`);
      if (!this.flags.quiet) {
         if (hasLocalChanges) {
            displayFileChanges({
               output: this.output,
               quiet: this.flags.quiet,
               changes: result.changes,
               blankBeforeEachCategory: true,
               blankAfterEachCategory: true,
            });
         }
         displayGlobalChanges({
            output: this.output,
            quiet: this.flags.quiet,
            globalChanges: result.globalChanges,
            blankBeforeEachGroup: true,
            blankAfterEachGroup: false,
            finalBlank: true,
         });
      }

      // Show Codex-specific usage instructions when MCP flags were generated
      if (editor === 'codex') {
         const hasCodexFlags = result.changes.some(
            (c) => c.action !== 'unchanged' && c.path.endsWith('codex-flags'),
         );

         if (hasCodexFlags) {
            this.output.info('MCP servers configured via CLI flags.');
            this.output.info('Usage: .aix/codex [prompt]');
         }
      }

      showUnsupportedFeatureWarnings(this.output, this.flags.quiet, editor, result.unsupportedFeatures);
   }

   /**
    * Save remote config to local ai.json (creates, merges, or overwrites).
    * For git sources, creates git references by default. Use forceCopy to copy files instead.
    */
   private async saveRemoteConfig(opts: {
      remoteConfig: AiJsonConfig;
      sections: ConfigSection[];
      overwrite: boolean;
      dryRun: boolean;
      configBaseDir?: string;
      gitSource?: GitSourceInfo;
      forceCopy?: boolean;
   }): Promise<void> {
      const { remoteConfig, sections, overwrite, dryRun, configBaseDir, gitSource, forceCopy } = opts;
      const localPath = join(process.cwd(), 'ai.json'),
            localExists = existsSync(localPath),
            projectRoot = process.cwd();

      // Filter remote config by sections
      let filteredRemote = filterConfigBySections(remoteConfig, sections);

      // Track what we did for output
      let filesCopied = 0;
      let gitRefsCreated: Array<{ name: string; type: string; gitRef: string }> = [];

      // Decide whether to use git references or copy files
      const useGitRefs = gitSource && !forceCopy;

      if (useGitRefs) {
         // Convert relative paths to git references
         const conversion = convertToGitReferences(filteredRemote, gitSource);

         filteredRemote = conversion.config;
         gitRefsCreated = conversion.converted;
      } else if (configBaseDir) {
         // Copy files to .aix/imported/
         const localized = await localizeRemoteConfig(filteredRemote, configBaseDir, projectRoot);

         filteredRemote = localized.config;
         filesCopied = localized.filesCopied;

         for (const warning of localized.warnings) {
            this.output.warn(warning);
         }
      }

      let finalConfig: AiJsonConfig;
      let action: 'created' | 'merged' | 'overwrote';

      if (!localExists) {
         // No local file - create new one with filtered remote config
         finalConfig = { ...filteredRemote } as AiJsonConfig;
         action = 'created';
      } else if (overwrite) {
         // Overwrite mode - replace local with filtered remote
         finalConfig = { ...filteredRemote } as AiJsonConfig;
         action = 'overwrote';
      } else {
         // Merge mode - read raw local config WITHOUT resolving extends to preserve the original
         // structure including extends and relative paths
         const localContent = readFileSync(localPath, 'utf-8'),
               localParsed = parseJsonc(localContent);

         if (localParsed.errors.length > 0) {
            this.error(`Could not parse local config: ${localParsed.errors[0]?.message}`);
         }
         const localConfig = localParsed.data as AiJsonConfig;

         finalConfig = mergeConfigs(localConfig, filteredRemote);
         action = 'merged';
      }

      // Validate the final config
      try {
         parseConfig(finalConfig);
      } catch (error) {
         if (configBaseDir && !useGitRefs) {
            await rollbackImport(projectRoot);
         }
         if (error instanceof Error && 'issues' in error) {
            const zodError = error as {
               issues: Array<{ path: (string | number)[]; message: string }>;
            };
            const parseError = new ConfigParseError(
               `${action === 'merged' ? 'Merged' : 'Resulting'} configuration is invalid`,
               localPath,
               zodError.issues.map((issue) => ({
                  path: issue.path.join('.'),
                  message: issue.message,
               })),
            );

            this.displayConfigParseError(parseError);
            this.log(
               `\nThe ${action === 'merged' ? 'merge' : 'save'} was aborted. Your local ai.json was not modified.`,
            );
            this.exit(1);
         }
         throw error;
      }

      if (dryRun) {
         this.output.info(`Would ${action === 'created' ? 'create' : action} ./ai.json`);
         if (action === 'merged') {
            this.output.info('  Sections merged: ' + sections.join(', '));
         }
         if (gitRefsCreated.length > 0) {
            this.output.info(`  Would create ${gitRefsCreated.length} git reference${gitRefsCreated.length === 1 ? '' : 's'}`);
            for (const ref of gitRefsCreated) {
               this.output.info(`    ${ref.type}/${ref.name} → ${ref.gitRef}`);
            }
         }
         if (filesCopied > 0) {
            this.output.info(`  Would copy ${filesCopied} file${filesCopied === 1 ? '' : 's'} to .aix/imported/`);
         }
         if (configBaseDir && !useGitRefs) {
            await rollbackImport(projectRoot);
         }
         return;
      }

      // Create backup before modifying existing file
      if (localExists) {
         await createBackup(localPath);
      }

      // Write the final config
      try {
         await writeFile(localPath, JSON.stringify(finalConfig, null, 2) + '\n', 'utf-8');
         // Commit the imported files (only if we copied files, not for git refs)
         if (configBaseDir && !useGitRefs) {
            await commitImport(projectRoot);
         }
      } catch (error) {
         if (configBaseDir && !useGitRefs) {
            await rollbackImport(projectRoot);
         }
         throw error;
      }

      const actionVerb =
         action === 'created' ? 'Created' : action === 'merged' ? 'Merged into' : 'Overwrote';

      this.output.success(`${actionVerb} ./ai.json`);
      if (action === 'merged') {
         this.output.info('  Sections merged: ' + sections.join(', '));
      }
      if (gitRefsCreated.length > 0) {
         this.output.info(`  Created ${gitRefsCreated.length} git reference${gitRefsCreated.length === 1 ? '' : 's'}:`);
         for (const ref of gitRefsCreated) {
            this.output.info(`    ${ref.type}/${ref.name} → ${ref.gitRef}`);
         }
      }
      if (filesCopied > 0) {
         this.output.info(`  Copied ${filesCopied} file${filesCopied === 1 ? '' : 's'} to .aix/imported/`);
      }
   }

}
