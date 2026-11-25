import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../../base-command.js';
import {
   onlyFlag,
   parseSections,
   includesSection,
   configScopeFlags,
   resolveListScope,
   type Section,
} from '../../flags/scope.js';
import {
   readState,
   importFromEditor,
   getAvailableEditors,
   getAcceptedEditorNames,
   isEditorInputName,
   normalizeEditorName,
   type StateFile,
   type StateSection,
   type EditorName,
   isDisabledConfigValue,
} from '@a1st/aix-core';
import { type HookAction, type HookMatcher } from '@a1st/aix-schema';

const CANONICAL_EDITORS = getAvailableEditors();
const VALID_EDITORS = getAcceptedEditorNames();

type EditorItemRow = {
   type: 'mcp' | 'rule' | 'skill' | 'prompt' | 'agent' | 'hook' | 'plugin' | 'marketplace';
   name: string;
   source: 'aix' | 'external';
   status: 'enabled' | 'disabled';
   scope: 'project' | 'user' | undefined;
   path: string | undefined;
};

type EditorListContext = {
   sections: Section[];
   scopeFilter: 'user' | 'project' | undefined;
   projectState: StateFile;
   userState: StateFile;
};

type EditorItemInput = {
   editor: EditorName;
   type: EditorItemRow['type'];
   name: string;
   section: StateSection;
   path: string | undefined;
   detectedScope: 'project' | 'user' | undefined;
   status?: 'enabled' | 'disabled';
   managedKey?: string;
};

export default class List extends BaseCommand<typeof List> {
   static override aliases = ['ls'];

   static override description = 'List native editor configuration';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --only skills',
      '<%= config.bin %> <%= command.id %> --only rules --only mcp',
      '<%= config.bin %> <%= command.id %> --only hooks',
      '<%= config.bin %> <%= command.id %> --scope user',
      '<%= config.bin %> <%= command.id %> --project',
      '<%= config.bin %> <%= command.id %> --all',
      '<%= config.bin %> <%= command.id %> --all --target codex',
      '<%= config.bin %> <%= command.id %> --all --target codex --target zed',
   ];

   static override flags = {
      ...onlyFlag,
      ...configScopeFlags,
      all: Flags.boolean({
         description: 'List user and project config from detected editors',
         default: false,
         exclusive: ['project', 'scope', 'user'],
      }),
      target: Flags.string({
         char: 't',
         aliases: ['editor'],
         charAliases: ['e'],
         description: 'Only show config from a specific editor (repeatable, case-insensitive)',
         multiple: true,
      }),
   };

   protected sectionsOverride?: readonly Section[];

   async run(): Promise<void> {
      const sections = this.sectionsOverride ? [...this.sectionsOverride] : parseSections(this.flags as { only?: string[] }),
            scope = resolveListScope(this.flags),
            editorFilter = this.resolveEditorFilter();

      await this.listAllEditorConfig(sections, scope === 'all' ? undefined : scope, editorFilter);
   }

   private resolveEditorFilter(): EditorName[] | undefined {
      const editors = this.flags.target;

      if (!editors || editors.length === 0) {
         return undefined;
      }

      const normalized = editors.map((editor) => editor.toLowerCase());

      for (const editor of normalized) {
         if (!isEditorInputName(editor)) {
            this.error(`Unknown editor: ${editor}. Valid options: ${VALID_EDITORS.join(', ')}`);
         }
      }

      return [ ...new Set(normalized.map(normalizeEditorName)) ];
   }

   /**
    * Scan editors' actual config directories and collect any discovered items.
    */
   private async collectEditorConfig(
      editors: EditorName[],
      scope: 'user' | 'project' | 'all',
   ): Promise<{
      results: Array<{ editor: EditorName; result: Awaited<ReturnType<typeof importFromEditor>> }>;
      projectState: StateFile;
      userState: StateFile;
   }> {
      const projectRoot = process.cwd(),
            projectState = await readState('project', projectRoot),
            userState = await readState('user'),
            imported = await Promise.all(editors.map(async (editor) => {
               try {
                  const result = await importFromEditor(editor, { projectRoot, scope });

                  return { editor, result };
               } catch {
                  return undefined;
               }
            })),
            results: Array<{
               editor: EditorName;
               result: Awaited<ReturnType<typeof importFromEditor>>;
            }> = [];

      for (const entry of imported) {
         if (entry && (this.hasEditorItems(entry.result) || entry.result.warnings.length > 0)) {
            results.push(entry);
         }
      }

      return { results, projectState, userState };
   }

   /**
    * List all AI config from editors (both aix-managed and externally managed).
    * Scans actual editor config directories to discover what's installed.
    */
   private async listAllEditorConfig(
      sections: Section[],
      scopeFilter: 'user' | 'project' | undefined,
      editorFilter: EditorName[] | undefined,
   ): Promise<void> {
      const editors = editorFilter ?? CANONICAL_EDITORS,
            scope: 'user' | 'project' | 'all' = scopeFilter ?? 'all',
            { results, projectState, userState } = await this.collectEditorConfig(editors, scope),
            context: EditorListContext = { sections, scopeFilter, projectState, userState },
            isEditorsOnly = sections.length === 1 && sections[0] === 'editors';

      if (isEditorsOnly) {
         const detectedEditors = results.map(({ editor }) => editor);

         if (this.flags.json) {
            this.output.json({
               version: 1,
               scope: scopeFilter ?? 'all',
               targets: editors,
               editors: detectedEditors,
               items: [],
               warnings: results.flatMap(({ editor, result }) => {
                  return result.warnings.map((warning) => ({ editor, warning }));
               }),
            });
            return;
         }

         if (detectedEditors.length === 0) {
            this.output.info('No editors with AI configuration found.');
            return;
         }

         for (const editor of detectedEditors) {
            this.output.log(editor);
         }
         return;
      }

      if (this.flags.json) {
         const items = results.flatMap(({ editor, result }) => {
            return this.getEditorItemRows(editor, result, context).map((row) => ({
               editor,
               type: row.type,
               name: row.name,
               source: row.source,
               status: row.status,
               scope: row.scope,
               path: row.path,
            }));
         });

         this.output.json({
            version: 1,
            scope: scopeFilter ?? 'all',
            targets: editors,
            items,
            warnings: results.flatMap(({ editor, result }) => {
               return result.warnings.map((warning) => ({ editor, warning }));
            }),
         });
         return;
      }

      if (results.length === 0) {
         this.output.info('No AI configuration found in any editor.');
         return;
      }

      let printed = 0;

      for (const { editor, result } of results) {
         const didPrint = this.printEditorConfig(editor, result, context, printed > 0);

         for (const warning of result.warnings) {
            this.output.warn(`${editor}: ${warning}`);
         }

         if (didPrint) {
            printed++;
         }
      }

      if (printed === 0 && !this.flags.json) {
         this.output.info('No external AI configuration found matching the given filters.');
      }
   }

   private hasEditorItems(result: Awaited<ReturnType<typeof importFromEditor>>): boolean {
      return (
         Object.keys(result.mcp).length > 0 ||
         result.rules.length > 0 ||
         Object.keys(result.skills).length > 0 ||
         Object.keys(result.prompts).length > 0 ||
         Object.keys(result.agents).length > 0 ||
         Object.keys(result.hooks).length > 0 ||
         Object.keys(result.plugins).length > 0 ||
         Object.keys(result.marketplaces).length > 0
      );
   }

   private printEditorConfig(
      editor: EditorName,
      result: Awaited<ReturnType<typeof importFromEditor>>,
      context: EditorListContext,
      addLeadingBlankLine: boolean,
   ): boolean {
      const rows = this.getEditorItemRows(editor, result, context);

      if (rows.length === 0) {
         return false;
      }

      if (addLeadingBlankLine) {
         this.output.log('');
      }
      this.output.log(
         `${chalk.bold(editor)} ${chalk.dim(`${rows.length} ${rows.length === 1 ? 'item' : 'items'}`)}`,
      );
      this.printEditorRows(rows);
      return true;
   }

   private getEditorItemRows(
      editor: EditorName,
      result: Awaited<ReturnType<typeof importFromEditor>>,
      context: EditorListContext,
   ): EditorItemRow[] {
      const rows: EditorItemRow[] = [];
      const { sections } = context;

      if (includesSection(sections, 'mcp')) {
         rows.push(
            ...Object.keys(result.mcp).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'mcp',
                     name,
                     section: 'mcp',
                     path: result.paths.mcp[name],
                     detectedScope: result.scopes.mcp[name],
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'rules')) {
         rows.push(
            ...result.rules.flatMap((rule) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'rule',
                     name: rule.name,
                     section: 'rules',
                     path: rule.path ?? result.paths.rules[rule.name],
                     detectedScope: rule.scope ?? result.scopes.rules[rule.name],
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'skills')) {
         rows.push(
            ...Object.keys(result.skills).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'skill',
                     name,
                     section: 'skills',
                     path: result.paths.skills[name],
                     detectedScope: result.scopes.skills[name],
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'prompts')) {
         rows.push(
            ...Object.keys(result.prompts).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'prompt',
                     name,
                     section: 'prompts',
                     path: result.paths.prompts[name],
                     detectedScope: result.scopes.prompts[name],
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'agents')) {
         rows.push(
            ...Object.keys(result.agents).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'agent',
                     name,
                     section: 'agents',
                     path: result.paths.agents[name],
                     detectedScope: result.scopes.agents[name],
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'hooks')) {
         for (const [event, matchers] of Object.entries(result.hooks)) {
            const hookItems = this.flattenHookItems(event, matchers);

            for (const hookItem of hookItems) {
               rows.push(
                  ...this.toEditorItemRow(
                     {
                        editor,
                        type: 'hook',
                        name: hookItem.name,
                        section: 'hooks',
                        path: result.paths.hooks[event],
                        detectedScope: result.scopes.hooks[event],
                        managedKey: event,
                     },
                     context,
                  ),
               );
            }
         }
      }

      if (includesSection(sections, 'plugins')) {
         rows.push(
            ...Object.keys(result.plugins).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'plugin',
                     name,
                     section: 'plugins',
                     path: result.paths.plugins[name],
                     detectedScope: result.scopes.plugins[name],
                     status: isDisabledConfigValue(result.plugins[name]) ? 'disabled' : 'enabled',
                  },
                  context,
               ),
            ),
         );
      }

      if (includesSection(sections, 'marketplaces')) {
         rows.push(
            ...Object.keys(result.marketplaces).flatMap((name) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'marketplace',
                     name,
                     section: 'marketplaces',
                     path: result.paths.marketplaces[name],
                     detectedScope: result.scopes.marketplaces[name],
                     status: isDisabledConfigValue(result.marketplaces[name]) ? 'disabled' : 'enabled',
                  },
                  context,
               ),
            ),
         );
      }

      rows.sort((left, right) => {
         const leftKey = `${left.type}\0${left.scope ?? ''}\0${left.name}\0${left.path ?? ''}`,
               rightKey = `${right.type}\0${right.scope ?? ''}\0${right.name}\0${right.path ?? ''}`;

         return leftKey.localeCompare(rightKey);
      });

      return rows;
   }

   private formatHookActionTarget(action: HookAction): string {
      const rawCommand = action.command ?? action.bash ?? action.powershell,
            command = rawCommand?.replace(/\s+/g, ' ').trim();

      if (action.name && command) {
         return `${action.name}: ${command}`;
      }

      if (action.name && action.url) {
         return `${action.name}: ${action.url}`;
      }

      if (action.name && action.prompt) {
         const prompt = action.prompt.replace(/\s+/g, ' ').trim(),
               displayPrompt = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;

         return `${action.name}: prompt "${displayPrompt}"`;
      }

      if (action.name && action.mcp_tool) {
         const server = action.mcp_server ? `${action.mcp_server}/` : '';

         return `${action.name}: mcp ${server}${action.mcp_tool}`;
      }

      if (action.name) {
         return action.name;
      }

      if (command) {
         return command;
      }

      if (action.url) {
         return `http ${action.url}`;
      }

      if (action.prompt) {
         const prompt = action.prompt.replace(/\s+/g, ' ').trim(),
               displayPrompt = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;

         return `prompt "${displayPrompt}"`;
      }

      if (action.mcp_tool) {
         const server = action.mcp_server ? `${action.mcp_server}/` : '';

         return `mcp ${server}${action.mcp_tool}`;
      }

      return action.description ?? 'hook';
   }

   private formatHookItemName(event: string, matcher?: string, action?: HookAction): string {
      const matcherPart = matcher ? ` [${matcher}]` : '';

      if (!action) {
         return `${event}${matcherPart}`;
      }

      const target = this.formatHookActionTarget(action);

      return `${event}${matcherPart} -> ${target}`;
   }

   private flattenHookItems(event: string, matchers: HookMatcher[]): Array<{ name: string }> {
      if (!matchers || matchers.length === 0) {
         return [ { name: event } ];
      }

      const items: Array<{ name: string }> = [];

      for (const matcher of matchers) {
         const hooks = matcher.hooks ?? [];

         if (hooks.length === 0) {
            items.push({ name: this.formatHookItemName(event, matcher.matcher) });
            continue;
         }

         for (const action of hooks) {
            items.push({ name: this.formatHookItemName(event, matcher.matcher, action) });
         }
      }

      return items.length > 0 ? items : [ { name: event } ];
   }

   private toEditorItemRow(input: EditorItemInput, context: EditorListContext): EditorItemRow[] {
      const { editor, type, name, section, path, detectedScope, status = 'enabled', managedKey } = input,
            { scopeFilter, projectState, userState } = context,
            managed = this.isAixManaged({ editor, name: managedKey ?? name, section, projectState, userState }),
            scope = detectedScope ?? managed?.scope;

      if (scopeFilter && scope !== scopeFilter) {
         return [];
      }

      return [
         {
            type,
            name,
            source: managed ? 'aix' : 'external',
            status,
            scope,
            path,
         },
      ];
   }

   private printEditorRows(rows: EditorItemRow[]): void {
      const typeWidth = Math.max('type'.length, ...rows.map((row) => row.type.length)),
            scopeWidth = Math.max(
               'scope'.length,
               ...rows.map((row) => (row.scope ?? 'unknown').length),
            ),
            sourceWidth = Math.max('source'.length, ...rows.map((row) => row.source.length)),
            statusWidth = Math.max('status'.length, ...rows.map((row) => row.status.length)),
            nameWidth = Math.max('name'.length, ...rows.map((row) => row.name.length));

      const header = `  ${'type'.padEnd(typeWidth)}  ${'scope'.padEnd(scopeWidth)}  ${'source'.padEnd(sourceWidth)}  ${'status'.padEnd(statusWidth)}  ${'name'.padEnd(nameWidth)}  path`;

      this.output.log(chalk.dim(header));
      this.output.log(chalk.dim(`  ${'-'.repeat(header.length - 2)}`));

      for (const row of rows) {
         const type = row.type.padEnd(typeWidth),
               scope = (row.scope ?? 'unknown').padEnd(scopeWidth),
               source = row.source.padEnd(sourceWidth),
               status = row.status.padEnd(statusWidth),
               name = row.name.padEnd(nameWidth),
               sourceColor = row.source === 'aix' ? chalk.green : chalk.blue,
               statusColor = row.status === 'disabled' ? chalk.yellow : chalk.dim;

         this.output.log(
            `  ${chalk.magenta(type)}  ${chalk.dim(scope)}  ${sourceColor(source)}  ${statusColor(status)}  ${this.output.cyan(name)}  ${chalk.dim(row.path ?? '')}`,
         );
      }
   }

   private isAixManaged(options: {
      editor: string;
      name: string;
      section: StateSection;
      projectState: StateFile;
      userState: StateFile;
   }): { scope: 'project' | 'user' } | undefined {
      const { editor, name, section, projectState, userState } = options;

      if (projectState.installed[section][name]?.editors.includes(editor)) {
         return { scope: 'project' };
      }
      if (userState.installed[section][name]?.editors.includes(editor)) {
         return { scope: 'user' };
      }
      return undefined;
   }
}
