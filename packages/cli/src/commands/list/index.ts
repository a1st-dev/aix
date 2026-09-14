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
   type InstalledItems,
   type InstalledItemMeta,
   isDisabledConfigValue,
} from '@a1st/aix-core';
import { resolveScope } from '@a1st/aix-schema';

const STATE_SECTIONS: StateSection[] = [
   'mcp',
   'skills',
   'rules',
   'prompts',
   'agents',
   'hooks',
   'plugins',
   'marketplaces',
];
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

   private getConfigSections(
      config: Record<string, unknown>,
      sections: Section[],
   ): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const section of [
         'skills',
         'mcp',
         'rules',
         'prompts',
         'agents',
         'hooks',
         'plugins',
         'marketplaces',
         'editors',
      ] as const) {
         if (includesSection(sections, section)) {
            result[section] = (config as Record<string, unknown>)[section] ?? {};
         }
      }
      return result;
   }

   private getStateSections(
      state: StateFile,
      sections: Section[],
      editorFilter: EditorName[] | undefined,
   ): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const section of STATE_SECTIONS) {
         if (!includesSection(sections, section)) {
            continue;
         }

         if (!editorFilter) {
            result[section] = state.installed[section];
            continue;
         }

         const editorSet = new Set<string>(editorFilter);
         const filtered: InstalledItems = {};

         for (const [name, meta] of Object.entries(state.installed[section])) {
            if (meta.editors.some((e) => editorSet.has(e))) {
               filtered[name] = meta;
            }
         }
         result[section] = filtered;
      }
      return result;
   }

   private printConfigSections(config: Record<string, unknown>, sections: Section[]): void {
      for (const section of [
         'skills',
         'mcp',
         'rules',
         'prompts',
         'agents',
         'hooks',
         'plugins',
         'marketplaces',
         'editors',
      ] as const) {
         if (!includesSection(sections, section)) {
            continue;
         }

         const items = (config as Record<string, unknown>)[section] ?? {};
         const entries = Object.entries(items);

         this.output.header(this.formatSectionName(section));

         if (entries.length === 0) {
            this.output.log(this.output.dim('  (none)'));
         } else {
            for (const [name, value] of entries) {
               const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

               this.output.log(`  ${this.output.cyan(name)}`);
               for (const line of formatted.split('\n')) {
                  this.output.log(`    ${line}`);
               }
            }
         }
      }
   }

   private printStateSections(
      state: StateFile,
      sections: Section[],
      scope: 'project' | 'user',
      editorFilter: EditorName[] | undefined,
   ): void {
      const editorSet = editorFilter ? new Set<string>(editorFilter) : undefined;
      const matchesFilter = (meta: InstalledItemMeta): boolean => {
         return !editorSet || meta.editors.some((e) => editorSet.has(e));
      };
      const hasItems = STATE_SECTIONS.some((s) =>
         Object.values(state.installed[s]).some(matchesFilter),
      );

      if (!hasItems) {
         return;
      }

      this.output.log('');
      this.output.log(chalk.bold(`📦 Installed items (scope: ${scope})`));
      this.output.log('');

      for (const section of STATE_SECTIONS) {
         if (!includesSection(sections, section)) {
            continue;
         }

         const items = state.installed[section],
               entries = Object.entries(items).filter(([, meta]) => matchesFilter(meta));

         if (entries.length === 0) {
            continue;
         }

         this.output.header(this.formatSectionName(section));

         for (const [name, meta] of entries) {
            const editors = meta.editors.length > 0 ? ` → ${meta.editors.join(', ')}` : '';

            this.output.log(`  ${this.output.cyan(name)}${this.output.dim(editors)}`);
         }
      }
   }

   private hasStateItems(state: StateFile, editorFilter: EditorName[] | undefined): boolean {
      if (!editorFilter) {
         return STATE_SECTIONS.some((s) => Object.keys(state.installed[s]).length > 0);
      }

      const editorSet = new Set<string>(editorFilter);

      return STATE_SECTIONS.some((s) =>
         Object.values(state.installed[s]).some((meta) => meta.editors.some((e) => editorSet.has(e))),
      );
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

   private formatSectionName(section: string): string {
      const names: Record<string, string> = {
         skills: 'Skills',
         mcp: 'MCP Servers',
         rules: 'Rules',
         prompts: 'Prompts',
         agents: 'Agents',
         hooks: 'Hooks',
         plugins: 'Plugins',
         marketplaces: 'Marketplaces',
         editors: 'Editors',
      };

      return names[section] ?? section;
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

   /**
    * List project config: ai.json plus items found in project-local editor config folders
    * (like .agents, .github/skills, .windsurf). The default (no scope flag) also shows
    * user-scope items tracked by aix state.
    */
   protected async listProjectConfig(
      sections: Section[],
      scopeFilter: 'project' | undefined,
   ): Promise<void> {
      const loaded = await this.loadConfig(),
            { results, projectState, userState } = await this.collectEditorConfig(
               CANONICAL_EDITORS,
               'project',
            ),
            context: EditorListContext = { sections, scopeFilter: 'project', projectState, userState };

      let printedAny = false;

      // Show ai.json config
      if (loaded) {
         const configScope = resolveScope(loaded.config);

         if (!scopeFilter || scopeFilter === configScope) {
            this.output.log('');
            this.output.log(chalk.bold(`📄 ai.json config (scope: ${configScope})`));
            this.output.log('');
            this.printConfigSections(loaded.config, sections);
            printedAny = true;
         }
      }

      // Show project-local editor config
      let printedEditors = 0;

      for (const { editor, result } of results) {
         if (this.printEditorConfig(editor, result, context, printedAny || printedEditors > 0)) {
            printedEditors++;
         }
      }
      printedAny = printedAny || printedEditors > 0;

      // The default listing also surfaces user-scope items installed by aix.
      if (!scopeFilter) {
         const hasUserItems = this.hasStateItems(userState, undefined);

         this.printStateSections(userState, sections, 'user', undefined);
         printedAny = printedAny || hasUserItems;
      }

      if (!printedAny) {
         this.output.info(
            'No configuration found. Run `aix init` to create ai.json or `aix add` to add items.',
         );
      }
   }

   protected async listProjectConfigJson(
      sections: Section[],
      scopeFilter: 'project' | undefined,
   ): Promise<void> {
      const loaded = await this.loadConfig(),
            { results, projectState, userState } = await this.collectEditorConfig(
               CANONICAL_EDITORS,
               'project',
            ),
            context: EditorListContext = { sections, scopeFilter: 'project', projectState, userState };
      const result: Record<string, unknown> = {};

      if (loaded) {
         const configScope = resolveScope(loaded.config);

         if (!scopeFilter || scopeFilter === configScope) {
            result.config = {
               scope: configScope,
               ...this.getConfigSections(loaded.config, sections),
            };
         }
      }

      const editors: Record<string, unknown> = {};

      for (const { editor, result: editorResult } of results) {
         editors[editor] = this.buildEditorJson(editor, editorResult, context);
      }
      if (Object.keys(editors).length > 0) {
         result.editors = editors;
      }

      // The default listing also surfaces user-scope items installed by aix.
      if (!scopeFilter) {
         result.state = {
            user: this.getStateSections(userState, sections, undefined),
         };
      }

      this.output.json(result);
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

   private buildEditorJson(
      editor: EditorName,
      result: Awaited<ReturnType<typeof importFromEditor>>,
      context: EditorListContext,
   ): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      const { sections, scopeFilter, projectState, userState } = context;

      if (includesSection(sections, 'mcp') && Object.keys(result.mcp).length > 0) {
         const items: Record<string, unknown> = {};

         for (const [name] of Object.entries(result.mcp)) {
            const managed = this.isAixManaged({ editor, name, section: 'mcp', projectState, userState });
            const scope = managed?.scope ?? result.scopes.mcp[name];

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[name] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: result.paths.mcp[name],
            };
         }
         if (Object.keys(items).length > 0) {
            out.mcp = items;
         }
      }

      if (includesSection(sections, 'rules') && result.rules.length > 0) {
         const items: Record<string, unknown> = {};

         for (const rule of result.rules) {
            const managed = this.isAixManaged({ editor, name: rule.name, section: 'rules', projectState, userState });
            const scope = rule.scope ?? result.scopes.rules[rule.name] ?? managed?.scope;

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[rule.name] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: rule.path ?? result.paths.rules[rule.name],
            };
         }
         if (Object.keys(items).length > 0) {
            out.rules = items;
         }
      }

      if (includesSection(sections, 'skills') && Object.keys(result.skills).length > 0) {
         const items: Record<string, unknown> = {};

         for (const [name] of Object.entries(result.skills)) {
            const managed = this.isAixManaged({ editor, name, section: 'skills', projectState, userState });
            const scope = managed?.scope ?? result.scopes.skills[name];

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[name] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: result.paths.skills[name],
            };
         }
         if (Object.keys(items).length > 0) {
            out.skills = items;
         }
      }

      if (includesSection(sections, 'prompts') && Object.keys(result.prompts).length > 0) {
         const items: Record<string, unknown> = {};

         for (const [name] of Object.entries(result.prompts)) {
            const managed = this.isAixManaged({ editor, name, section: 'prompts', projectState, userState });
            const scope = managed?.scope ?? result.scopes.prompts[name];

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[name] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: result.paths.prompts[name],
            };
         }
         if (Object.keys(items).length > 0) {
            out.prompts = items;
         }
      }

      if (includesSection(sections, 'agents') && Object.keys(result.agents).length > 0) {
         const items: Record<string, unknown> = {};

         for (const [name] of Object.entries(result.agents)) {
            const managed = this.isAixManaged({ editor, name, section: 'agents', projectState, userState });
            const scope = managed?.scope ?? result.scopes.agents[name];

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[name] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: result.paths.agents[name],
            };
         }
         if (Object.keys(items).length > 0) {
            out.agents = items;
         }
      }

      if (includesSection(sections, 'hooks') && Object.keys(result.hooks).length > 0) {
         const items: Record<string, unknown> = {};

         for (const event of Object.keys(result.hooks)) {
            const managed = this.isAixManaged({ editor, name: event, section: 'hooks', projectState, userState });
            const scope = managed?.scope ?? result.scopes.hooks[event];

            if (scopeFilter && scope !== scopeFilter) {
               continue;
            }
            items[event] = {
               source: managed ? 'aix' : 'external',
               scope,
               path: result.paths.hooks[event],
            };
         }
         if (Object.keys(items).length > 0) {
            out.hooks = items;
         }
      }

      if (includesSection(sections, 'plugins') && Object.keys(result.plugins).length > 0) {
         const items: Record<string, unknown> = {};

         for (const name of Object.keys(result.plugins)) {
            const managed = this.isAixManaged({ editor, name, section: 'plugins', projectState, userState }),
                  scope = managed?.scope ?? result.scopes.plugins[name];

            if (!scopeFilter || scope === scopeFilter) {
               items[name] = {
                  source: managed ? 'aix' : 'external',
                  scope,
                  path: result.paths.plugins[name],
               };
            }
         }
         if (Object.keys(items).length > 0) {
            out.plugins = items;
         }
      }

      if (includesSection(sections, 'marketplaces') && Object.keys(result.marketplaces).length > 0) {
         const items: Record<string, unknown> = {};

         for (const name of Object.keys(result.marketplaces)) {
            const managed = this.isAixManaged({ editor, name, section: 'marketplaces', projectState, userState }),
                  scope = managed?.scope ?? result.scopes.marketplaces[name];

            if (!scopeFilter || scope === scopeFilter) {
               items[name] = {
                  source: managed ? 'aix' : 'external',
                  scope,
                  path: result.paths.marketplaces[name],
               };
            }
         }
         if (Object.keys(items).length > 0) {
            out.marketplaces = items;
         }
      }

      return out;
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
         rows.push(
            ...Object.keys(result.hooks).flatMap((event) =>
               this.toEditorItemRow(
                  {
                     editor,
                     type: 'hook',
                     name: event,
                     section: 'hooks',
                     path: result.paths.hooks[event],
                     detectedScope: result.scopes.hooks[event],
                  },
                  context,
               ),
            ),
         );
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

   private toEditorItemRow(input: EditorItemInput, context: EditorListContext): EditorItemRow[] {
      const { editor, type, name, section, path, detectedScope, status = 'enabled' } = input,
            { scopeFilter, projectState, userState } = context;
      const managed = this.isAixManaged({ editor, name, section, projectState, userState }),
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
