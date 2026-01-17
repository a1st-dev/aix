import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Args, Flags } from '@oclif/core';
import { dirname, join } from 'pathe';
import { select, confirm } from '@inquirer/prompts';
import { parseConfig, normalizeEditors, type AiJsonConfig } from '@a1st/aix-schema';
import { BaseCommand } from '../base-command.js';
import { ConfigParseError } from '@a1st/aix-core';
import { scopeFlag, parseScopes } from '../flags/scope.js';
import {
   installToEditor,
   getAvailableEditors,
   detectEditors,
   updateConfig,
   loadConfig,
   createBackup,
   mergeConfigs,
   filterConfigByScopes,
   cleanStaleCache,
   localizeRemoteConfig,
   commitImport,
   rollbackImport,
   type EditorName,
   type ApplyResult,
   type LoadedConfig,
   type ConfigScope,
   type UnsupportedFeatures,
   type FileChange,
   type FileChangeCategory,
} from '@a1st/aix-core';

const VALID_EDITORS = getAvailableEditors();

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
      '<%= config.bin %> <%= command.id %> --scope mcp',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save --overwrite',
      '<%= config.bin %> <%= command.id %> github:org/shared-config --save --scope mcp --scope rules',
   ];

   static override args = {
      source: Args.string({
         description:
            'Config source: URL, git shorthand (github:org/repo), or local path. If omitted, uses local ai.json.',
         required: false,
      }),
   };

   static override flags = {
      ...scopeFlag,
      target: Flags.string({
         char: 't',
         description: 'Target specific editor (repeatable, case-insensitive)',
         multiple: true,
         options: getAvailableEditors(),
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
   };

   async run(): Promise<void> {
      const { args } = await this.parse(Install);

      // Load config from source argument or fall back to local discovery
      let loaded: LoadedConfig;

      if (args.source) {
         const result = await loadConfig({ remoteSource: args.source });

         if (!result) {
            this.error(`Could not load config from: ${args.source}`);
         }
         loaded = result;
      } else {
         loaded = await this.requireConfig();
      }

      const scopes = parseScopes(this.flags as { scope?: string[] }),
            projectRoot = args.source ? process.cwd() : dirname(loaded.path),
            isSaveMode = this.flags.save,
            isDryRun = this.flags['dry-run'];

      // Handle --save flag: save remote config to local ai.json
      if (isSaveMode) {
         if (!args.source) {
            this.error('--save requires a remote source argument (URL, git shorthand, or path)');
         }

         await this.saveRemoteConfig({
            remoteConfig: loaded.config,
            scopes: scopes as ConfigScope[],
            overwrite: this.flags.overwrite,
            dryRun: isDryRun,
            configBaseDir: loaded.configBaseDir,
         });

         // If only saving (no editor installation needed), we're done
         if (!this.flags.target && !loaded.config.editors) {
            return;
         }
      }

      // Resolve which editors to install to
      const resolved = await this.resolveEditors(loaded.config, projectRoot);

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
            scopes,
            clean: this.flags.clean,
            configBaseDir: loaded.configBaseDir,
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
               saveToConfig = await confirm({
                  message: `Save "${editor}" as the default editor in ai.json?`,
                  default: true,
               });

         if (saveToConfig) {
            await updateConfig(loaded.path, (config) => ({
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

      if (this.flags.json) {
         this.output.json({
            dryRun: isDryRun,
            scopes,
            results,
         });
      }
   }

   /**
    * Resolve which editors to install to based on flags, config, and detection.
    */
   private async resolveEditors(
      config: AiJsonConfig,
      projectRoot: string,
   ): Promise<{ editors: EditorName[]; shouldPromptToSave: boolean } | null> {
      let editors: EditorName[] = [];
      let shouldPromptToSave = false;

      if (this.flags.target && this.flags.target.length > 0) {
         editors = this.flags.target.map((e) => e.toLowerCase() as EditorName);
         for (const editor of editors) {
            if (!VALID_EDITORS.includes(editor)) {
               this.error(`Unknown editor: ${editor}. Valid options: ${VALID_EDITORS.join(', ')}`);
            }
         }
      } else {
         const configEditors = config.editors;

         if (configEditors) {
            const normalized = normalizeEditors(configEditors);

            editors = Object.keys(normalized) as EditorName[];
         }

         if (editors.length === 0) {
            const detected = await detectEditors(projectRoot);

            if (detected.length === 0) {
               this.output.warn('No editors detected. Use --target to specify an editor.');
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
         this.output.warn('No editors found. Use --target to specify an editor.');
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
      options: { isDryRun: boolean; scopes: ConfigScope[]; clean?: boolean; configBaseDir?: string },
   ): Promise<ApplyResult> {
      const { isDryRun, scopes, clean, configBaseDir } = options;

      this.output.startSpinner(isDryRun ? `Analyzing ${editor}...` : `Installing to ${editor}...`);

      try {
         const result = await installToEditor(editor, config, projectRoot, {
            dryRun: isDryRun,
            scopes,
            overwrite: this.flags.overwrite,
            clean,
            configBaseDir,
         });

         this.handleInstallResult(editor, result, projectRoot, isDryRun);
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
      projectRoot: string,
      isDryRun: boolean,
   ): void {
      if (isDryRun) {
         this.output.stopSpinner(true, `Changes for ${editor}:`);
         if (result.changes.length === 0) {
            this.output.info('No changes needed (no rules or MCP servers configured)');
         } else {
            this.displayChanges(result.changes, projectRoot, true);
         }
         this.showUnsupportedFeatureWarnings(editor, result.unsupportedFeatures);
         return;
      }

      if (!result.success) {
         this.output.stopSpinner(false, `Failed to install to ${editor}`);
         for (const err of result.errors) {
            this.output.error(err);
         }
         return;
      }

      if (result.changes.length === 0) {
         this.output.stopSpinner(
            true,
            `Nothing to install for ${editor} (no rules or MCP servers configured)`,
         );
         return;
      }

      this.output.stopSpinner(true, `Installed to ${editor}`);
      if (!this.flags.quiet) {
         this.displayChanges(result.changes, projectRoot);
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

      this.showUnsupportedFeatureWarnings(editor, result.unsupportedFeatures);
   }

   /**
    * Save remote config to local ai.json (creates, merges, or overwrites).
    * If configBaseDir is provided, copies referenced files to .aix/imported/.
    */
   private async saveRemoteConfig(opts: {
      remoteConfig: AiJsonConfig;
      scopes: ConfigScope[];
      overwrite: boolean;
      dryRun: boolean;
      configBaseDir?: string;
   }): Promise<void> {
      const { remoteConfig, scopes, overwrite, dryRun, configBaseDir } = opts;
      const localPath = join(process.cwd(), 'ai.json'),
            localExists = existsSync(localPath),
            projectRoot = process.cwd();

      // Filter remote config by scopes
      let filteredRemote = filterConfigByScopes(remoteConfig, scopes);

      // If we have a configBaseDir, localize the config by copying referenced files
      let filesCopied = 0;

      if (configBaseDir) {
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
         // Merge mode - load local and merge remote into it
         const localLoaded = await loadConfig(localPath);

         if (!localLoaded) {
            this.error(`Could not load local config from: ${localPath}`);
         }
         finalConfig = mergeConfigs(localLoaded.config, filteredRemote);
         action = 'merged';
      }

      // Validate the final config
      try {
         parseConfig(finalConfig);
      } catch (error) {
         if (configBaseDir) {
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
            this.output.info('  Sections merged: ' + scopes.join(', '));
         }
         if (filesCopied > 0) {
            this.output.info(`  Would copy ${filesCopied} file${filesCopied === 1 ? '' : 's'} to .aix/imported/`);
         }
         await rollbackImport(projectRoot);
         return;
      }

      // Create backup before modifying existing file
      if (localExists) {
         await createBackup(localPath);
      }

      // Write the final config
      try {
         await writeFile(localPath, JSON.stringify(finalConfig, null, 2) + '\n', 'utf-8');
         // Commit the imported files
         if (configBaseDir) {
            await commitImport(projectRoot);
         }
      } catch (error) {
         if (configBaseDir) {
            await rollbackImport(projectRoot);
         }
         throw error;
      }

      const actionVerb =
         action === 'created' ? 'Created' : action === 'merged' ? 'Merged into' : 'Overwrote';

      this.output.success(`${actionVerb} ./ai.json`);
      if (action === 'merged') {
         this.output.info('  Sections merged: ' + scopes.join(', '));
      }
      if (filesCopied > 0) {
         this.output.info(`  Copied ${filesCopied} file${filesCopied === 1 ? '' : 's'} to .aix/imported/`);
      }
   }

   /**
    * Display warnings for features that the editor doesn't support.
    */
   private showUnsupportedFeatureWarnings(editor: EditorName, unsupported?: UnsupportedFeatures): void {
      if (!unsupported || this.flags.quiet) {
         return;
      }

      if (unsupported.mcp) {
         this.output.warn(
            `${editor} does not support MCP. Skipped servers: ${unsupported.mcp.servers.join(', ')}`,
         );
      }

      if (unsupported.hooks) {
         if (unsupported.hooks.allUnsupported) {
            this.output.warn(`${editor} does not support hooks. All hooks skipped.`);
         } else if (unsupported.hooks.unsupportedEvents?.length) {
            this.output.warn(
               `${editor} does not support these hook events: ${unsupported.hooks.unsupportedEvents.join(', ')}`,
            );
         }
      }

      if (unsupported.prompts) {
         this.output.warn(
            `${editor} does not support prompts. Skipped: ${unsupported.prompts.prompts.join(', ')}`,
         );
      }
   }

   /**
    * Display changes grouped by category with better visual hierarchy.
    */
   private displayChanges(changes: FileChange[], _projectRoot: string, showAction = false): void {
      // Group changes by category
      const byCategory = new Map<FileChangeCategory, FileChange[]>();

      for (const change of changes) {
         const category = change.category ?? 'other';
         const list = byCategory.get(category) ?? [];

         list.push(change);
         byCategory.set(category, list);
      }

      // Display order and labels
      const categoryOrder: Array<{ key: FileChangeCategory; label: string }> = [
         { key: 'skill', label: 'Skills' },
         { key: 'rule', label: 'Rules' },
         { key: 'workflow', label: 'Workflows' },
         { key: 'mcp', label: 'MCP' },
         { key: 'hook', label: 'Hooks' },
         { key: 'other', label: 'Other' },
      ];

      for (const { key, label } of categoryOrder) {
         const categoryChanges = byCategory.get(key);

         if (!categoryChanges || categoryChanges.length === 0) {
            continue;
         }

         this.output.log('');
         this.output.log(this.output.cyan(`  ${label}`));

         // For skills, deduplicate by name (each skill has both .aix and editor symlink changes)
         const seenNames = new Set<string>();

         for (const change of categoryChanges) {
            const name =
               key === 'skill' ? this.extractSkillName(change.path) : this.extractFileName(change.path);

            // Skip duplicate skill names
            if (key === 'skill') {
               if (seenNames.has(name)) {
                  continue;
               }
               seenNames.add(name);
            }

            const prefix = this.getChangePrefix(change.action),
                  action = showAction ? ` ${this.output.dim(`(${change.action})`)}` : '';

            this.output.log(`    ${prefix} ${name}${action}`);
         }
      }

      this.output.log('');
   }

   /**
    * Get the display prefix for a change action.
    */
   private getChangePrefix(action: FileChange['action']): string {
      switch (action) {
      case 'create':
         return this.output.green('✓');
      case 'update':
         return this.output.green('✓');
      case 'unchanged':
         return this.output.green('✓');
      case 'delete':
         return this.output.red('-');
      }
   }

   /**
    * Extract skill name from path like .aix/skills/pdf or .windsurf/skills/pdf -> pdf
    */
   private extractSkillName(path: string): string {
      // Match both .aix/skills/{name} and editor skills dirs like .windsurf/skills/{name}
      const match = path.match(/(?:\.aix|\.windsurf|\.cursor|\.claude|\.vscode)\/skills\/([^/]+)/);

      return match?.[1] ?? this.extractFileName(path);
   }

   /**
    * Extract filename from path
    */
   private extractFileName(path: string): string {
      const parts = path.split('/'),
            last = parts[parts.length - 1];

      return last !== undefined ? last : path;
   }
}
