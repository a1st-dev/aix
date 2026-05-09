import { Args, Flags } from '@oclif/core';
import type { ConfigScope } from '@a1st/aix-schema';
import type {
   EditorName,
   ApplyResult,
   FileChange,
   FileChangeCategory,
   UnsupportedFeatures,
   TargetScopeLimitations,
} from '@a1st/aix-core';
import {
   getAvailableEditors,
   importFromEditor,
   normalizeEditorImport,
   buildConfigFromEditorImport,
   installToEditor,
} from '@a1st/aix-core';
import { BaseCommand } from '../base-command.js';

const VALID_EDITORS = getAvailableEditors();

export default class Sync extends BaseCommand<typeof Sync> {
   static override description = 'Sync supported configuration from one editor to another';

   static override examples = [
      '<%= config.bin %> <%= command.id %> cursor --to claude-code',
      '<%= config.bin %> <%= command.id %> cursor --to opencode --scope project',
      '<%= config.bin %> <%= command.id %> opencode --to windsurf --from-scope project --to-scope user',
      '<%= config.bin %> <%= command.id %> cursor --to zed --dry-run',
   ];

   static override args = {
      from: Args.string({
         description: `Source editor (${VALID_EDITORS.join(', ')})`,
         required: true,
         options: VALID_EDITORS,
      }),
   };

   static override flags = {
      to: Flags.string({
         char: 't',
         description: 'Destination editor',
         required: true,
         options: VALID_EDITORS,
      }),
      scope: Flags.string({
         char: 's',
         description: 'Apply the same scope to both source and destination',
         options: ['user', 'project'],
      }),
      'from-scope': Flags.string({
         description: 'Scope to read from on the source editor',
         options: ['user', 'project'],
      }),
      'to-scope': Flags.string({
         description: 'Scope to write to on the destination editor',
         options: ['user', 'project'],
      }),
      'dry-run': Flags.boolean({
         char: 'd',
         description: 'Preview sync changes without applying them',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const { args, flags } = await this.parse(Sync),
            from = args.from as EditorName,
            to = flags.to as EditorName,
            sharedScope = flags.scope as ConfigScope | undefined,
            fromScope = (flags['from-scope'] as ConfigScope | undefined) ?? sharedScope ?? 'user',
            toScope = (flags['to-scope'] as ConfigScope | undefined) ?? sharedScope ?? 'user',
            projectRoot = process.cwd(),
            isDryRun = flags['dry-run'];

      if (from === to) {
         this.error('Source and destination editors must differ.');
      }

      this.output.startSpinner(
         isDryRun ? `Analyzing sync from ${from} to ${to}...` : `Syncing ${from} to ${to}...`,
      );

      try {
         const imported = await importFromEditor(from, {
                  projectRoot,
                  scope: fromScope,
               }),
               importWarnings = [ ...new Set(imported.warnings) ],
               normalized = normalizeEditorImport(from, imported),
               importedCount = this.countImported(normalized);

         this.showImportWarnings(importWarnings);

         if (importedCount === 0) {
            this.output.stopSpinner(
               true,
               `No supported configuration found in ${from} (${fromScope} scope)`,
            );
            return;
         }

         const result = await installToEditor(
            to,
            buildConfigFromEditorImport(from, imported),
            projectRoot,
            {
               dryRun: isDryRun,
               targetScope: toScope,
               strictTargetScope: true,
            },
         );

         if (!result.success) {
            this.output.stopSpinner(false, `Failed to sync ${from} to ${to}`);
            for (const error of result.errors) {
               this.output.error(error);
            }
            return;
         }

         this.output.stopSpinner(
            true,
            isDryRun ? `Sync preview for ${from} -> ${to}` : `Synced ${from} -> ${to}`,
         );

         this.displayImportSummary(from, fromScope, normalized);
         this.displayChanges(result.changes, isDryRun);
         this.displayGlobalChanges(result.globalChanges);
         this.showUnsupportedFeatureWarnings(to, result.unsupportedFeatures);
         this.showTargetScopeLimitations(to, toScope, result.targetScopeLimitations);
         this.showNoWritableChangesMessage(to, result);

         if (this.flags.json) {
            this.output.json({
               from,
               to,
               fromScope,
               toScope,
               dryRun: isDryRun,
               imported: {
                  mcp: Object.keys(normalized.mcp).length,
                  rules: normalized.rules.length,
                  prompts: normalized.prompts.length,
                  skills: normalized.skills.length,
                  hooks: Object.keys(normalized.hooks).length,
               },
               importWarnings,
               noWritableChanges: !this.hasWritableChanges(result),
               result,
            });
         }
      } catch (error) {
         this.output.stopSpinner(false, `Failed to sync ${from} to ${to}`);
         throw error;
      }
   }

   private countImported(normalized: ReturnType<typeof normalizeEditorImport>): number {
      return (
         Object.keys(normalized.mcp).length +
         normalized.rules.length +
         normalized.prompts.length +
         normalized.skills.length +
         Object.keys(normalized.hooks).length
      );
   }

   private showImportWarnings(warnings: string[]): void {
      if (warnings.length === 0 || this.flags.quiet) {
         return;
      }

      for (const warning of warnings) {
         this.output.warn(warning);
      }
   }

   private displayImportSummary(
      from: EditorName,
      fromScope: ConfigScope,
      normalized: ReturnType<typeof normalizeEditorImport>,
   ): void {
      this.output.log('');
      this.output.log(this.output.cyan(`  Imported from ${from} (${fromScope})`));
      this.output.log(`    ${this.output.green('✓')} MCP servers: ${Object.keys(normalized.mcp).length}`);
      this.output.log(`    ${this.output.green('✓')} rules: ${normalized.rules.length}`);
      this.output.log(`    ${this.output.green('✓')} prompts: ${normalized.prompts.length}`);
      this.output.log(`    ${this.output.green('✓')} skills: ${normalized.skills.length}`);
      this.output.log(`    ${this.output.green('✓')} hooks: ${Object.keys(normalized.hooks).length}`);
      this.output.log('');
   }

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

   private showTargetScopeLimitations(
      editor: EditorName,
      targetScope: ConfigScope,
      limitations?: TargetScopeLimitations,
   ): void {
      if (!limitations || this.flags.quiet) {
         return;
      }

      if (limitations.rules) {
         this.output.warn(
            `${editor} cannot write rules at ${targetScope} scope. Skipped: ${limitations.rules.rules.join(', ')}`,
         );
      }

      if (limitations.skills) {
         this.output.warn(
            `${editor} cannot activate these skills at ${targetScope} scope. Skipped: ${limitations.skills.skills.join(', ')}`,
         );
      }

      if (limitations.hooks) {
         this.output.warn(
            `${editor} cannot write hooks at ${targetScope} scope. Skipped events: ${limitations.hooks.events.join(', ')}`,
         );
      }
   }

   private displayChanges(changes: FileChange[], showAction = false): void {
      if (changes.length === 0 || this.flags.quiet) {
         return;
      }

      const byCategory = new Map<FileChangeCategory, FileChange[]>();

      for (const change of changes) {
         const category = change.category ?? 'other',
               list = byCategory.get(category) ?? [];

         list.push(change);
         byCategory.set(category, list);
      }

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

         this.output.log(this.output.cyan(`  ${label}`));

         const seenNames = new Set<string>();

         for (const change of categoryChanges) {
            const name =
               key === 'skill' ? this.extractSkillName(change.path) : this.extractFileName(change.path);

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

         this.output.log('');
      }
   }

   private getChangePrefix(action: FileChange['action']): string {
      switch (action) {
         case 'create':
         case 'update':
         case 'unchanged':
            return this.output.green('✓');
         case 'delete':
            return this.output.red('-');
      }
   }

   private displayGlobalChanges(globalChanges?: ApplyResult['globalChanges']): void {
      if (!globalChanges || this.flags.quiet) {
         return;
      }

      const groups = [
         { label: 'Global MCP', type: 'mcp' as const },
         { label: 'Global Prompts', type: 'prompt' as const },
      ];

      for (const { label, type } of groups) {
         const applied = globalChanges.applied.filter((change) => change.type === type),
               skipped = globalChanges.skipped.filter((change) => change.type === type);

         if (applied.length === 0 && skipped.length === 0) {
            continue;
         }

         this.output.log(this.output.cyan(`  ${label}`));

         for (const change of applied) {
            this.output.log(`    ${this.output.green('✓')} ${change.name}`);
         }
         for (const change of skipped) {
            this.output.log(`    ${this.output.dim('-')} ${change.name} ${this.output.dim(`(${change.reason})`)}`);
         }

         this.output.log('');
      }

      for (const warning of globalChanges.warnings) {
         this.output.warn(warning);
      }
   }

   private hasWritableChanges(result: ApplyResult): boolean {
      return (
         result.changes.some((change) => change.action !== 'unchanged') ||
         Boolean(result.globalChanges && result.globalChanges.applied.length > 0)
      );
   }

   private showNoWritableChangesMessage(editor: EditorName, result: ApplyResult): void {
      if (this.flags.quiet || this.hasWritableChanges(result)) {
         return;
      }

      const hasSkippedFeatures = Boolean(
         result.globalChanges?.skipped.length ||
         result.unsupportedFeatures?.mcp ||
         result.unsupportedFeatures?.hooks ||
         result.unsupportedFeatures?.prompts ||
         result.targetScopeLimitations?.rules ||
         result.targetScopeLimitations?.skills ||
         result.targetScopeLimitations?.hooks,
      );

      if (hasSkippedFeatures) {
         this.output.info(
            `No writable destination changes remain after applying ${editor} support and scope limits.`,
         );
         return;
      }

      this.output.info(`No destination changes were needed for ${editor}.`);
   }

   private extractSkillName(path: string): string {
      const match = path.match(
         /(?:\.aix|\.agents|\.windsurf|\.cursor|\.claude|\.github|\.codex|\.gemini|\.opencode)\/skills\/([^/]+)/,
      );

      return match?.[1] ?? this.extractFileName(path);
   }

   private extractFileName(path: string): string {
      const parts = path.split('/'),
            last = parts[parts.length - 1];

      return last !== undefined ? last : path;
   }
}
