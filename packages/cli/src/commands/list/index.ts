import { Flags } from '@oclif/core';
import chalk from 'chalk';
import { BaseCommand } from '../../base-command.js';
import {
   onlyFlag,
   parseSections,
   includesSection,
   configScopeFlags,
   resolveConfigScope,
   type Section,
} from '../../flags/scope.js';
import {
   readState,
   importFromEditor,
   getAvailableEditors,
   type StateFile,
   type StateSection,
   type EditorName,
} from '@a1st/aix-core';
import { resolveScope } from '@a1st/aix-schema';

const STATE_SECTIONS: StateSection[] = ['mcp', 'skills', 'rules', 'prompts', 'agents'];
const VALID_EDITORS = getAvailableEditors() as EditorName[];

type EditorItemRow = {
   type: 'mcp' | 'rule' | 'skill' | 'prompt' | 'agent';
   name: string;
   source: 'aix' | 'external';
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
   type: EditorItemRow['type'];
   name: string;
   section: StateSection;
   path: string | undefined;
   detectedScope: 'project' | 'user' | undefined;
};

export default class List extends BaseCommand<typeof List> {
   static override aliases = ['ls'];

   static override description = 'List configured items';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --only skills',
      '<%= config.bin %> <%= command.id %> --only rules --only mcp',
      '<%= config.bin %> <%= command.id %> --scope user',
      '<%= config.bin %> <%= command.id %> --project',
      '<%= config.bin %> <%= command.id %> --all',
      '<%= config.bin %> <%= command.id %> --all --editor codex',
      '<%= config.bin %> <%= command.id %> --all --editor codex --editor zed',
      '<%= config.bin %> <%= command.id %> --all --scope user --only mcp',
   ];

   static override flags = {
      ...onlyFlag,
      ...configScopeFlags,
      all: Flags.boolean({
         description: 'List all AI config from editors (including non-aix managed)',
         default: false,
      }),
      editor: Flags.string({
         char: 'e',
         description: 'Only show config from a specific editor (repeatable, case-insensitive)',
         multiple: true,
      }),
   };

   async run(): Promise<void> {
      const sections = parseSections(this.flags as { only?: string[] }),
            scopeFilter = resolveConfigScope(
               this.flags as { scope?: string; user?: boolean; project?: boolean },
               undefined,
            );

      // If --all flag is set, show all editor config
      if (this.flags.all) {
         await this.listAllEditorConfig(sections, scopeFilter, this.resolveEditorFilter());
         return;
      }

      // Load ai.json config if available
      const loaded = await this.loadConfig();

      // Load state for both scopes
      const projectState = await readState('project', process.cwd()),
            userState = await readState('user');

      if (this.flags.json) {
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
         result.state = {
            ...((!scopeFilter || scopeFilter === 'project') && {
               project: this.getStateSections(projectState, sections),
            }),
            ...((!scopeFilter || scopeFilter === 'user') && {
               user: this.getStateSections(userState, sections),
            }),
         };
         this.output.json(result);
         return;
      }

      // Show ai.json config
      if (loaded) {
         const configScope = resolveScope(loaded.config);

         if (!scopeFilter || scopeFilter === configScope) {
            this.output.log('');
            this.output.log(chalk.bold(`📄 ai.json config (scope: ${configScope})`));
            this.output.log('');
            this.printConfigSections(loaded.config, sections);
         }
      }

      // Show state-tracked items
      const showProject = !scopeFilter || scopeFilter === 'project',
            showUser = !scopeFilter || scopeFilter === 'user';

      if (showProject) {
         this.printStateSections(projectState, sections, 'project');
      }
      if (showUser) {
         this.printStateSections(userState, sections, 'user');
      }

      if (!loaded && !this.hasStateItems(projectState) && !this.hasStateItems(userState)) {
         this.output.info(
            'No configuration found. Run `aix init` to create ai.json or `aix add` to add items.',
         );
      }
   }

   private getConfigSections(
      config: Record<string, unknown>,
      sections: Section[],
   ): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const section of ['skills', 'mcp', 'rules', 'prompts', 'agents', 'editors'] as const) {
         if (includesSection(sections, section)) {
            result[section] = (config as Record<string, unknown>)[section] ?? {};
         }
      }
      return result;
   }

   private getStateSections(state: StateFile, sections: Section[]): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const section of STATE_SECTIONS) {
         if (includesSection(sections, section)) {
            result[section] = state.installed[section];
         }
      }
      return result;
   }

   private printConfigSections(config: Record<string, unknown>, sections: Section[]): void {
      for (const section of ['skills', 'mcp', 'rules', 'prompts', 'agents', 'editors'] as const) {
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
   ): void {
      const hasItems = STATE_SECTIONS.some((s) => Object.keys(state.installed[s]).length > 0);

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
               entries = Object.entries(items);

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

   private hasStateItems(state: StateFile): boolean {
      return STATE_SECTIONS.some((s) => Object.keys(state.installed[s]).length > 0);
   }

   private resolveEditorFilter(): EditorName[] | undefined {
      const editors = this.flags.editor;

      if (!editors || editors.length === 0) {
         return undefined;
      }

      const normalized = editors.map((editor) => editor.toLowerCase() as EditorName);

      for (const editor of normalized) {
         if (!VALID_EDITORS.includes(editor)) {
            this.error(`Unknown editor: ${editor}. Valid options: ${VALID_EDITORS.join(', ')}`);
         }
      }

      return [...new Set(normalized)];
   }

   private formatSectionName(section: string): string {
      const names: Record<string, string> = {
         skills: 'Skills',
         mcp: 'MCP Servers',
         rules: 'Rules',
         prompts: 'Prompts',
         agents: 'Agents',
         editors: 'Editors',
      };

      return names[section] ?? section;
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
      const editors = editorFilter ?? VALID_EDITORS;
      const projectRoot = process.cwd();

      // Load state to identify aix-managed items
      const projectState = await readState('project', projectRoot);
      const userState = await readState('user');

      const allResults: Array<{
         editor: EditorName;
         result: Awaited<ReturnType<typeof importFromEditor>>;
      }> = [];

      for (const editor of editors) {
         try {
            // eslint-disable-next-line no-await-in-loop -- Sequential for consistency
            const result = await importFromEditor(editor, { projectRoot });

            if (this.hasEditorItems(result)) {
               allResults.push({ editor, result });
            }
         } catch {
            // Skip editors that fail to import (not installed, etc.)
         }
      }

      if (allResults.length === 0) {
         this.output.info('No AI configuration found in any editor.');
         return;
      }

      if (this.flags.json) {
         const jsonResult: Record<string, unknown> = {};

         for (const { editor, result } of allResults) {
            jsonResult[editor] = this.buildEditorJson(result, {
               sections,
               scopeFilter,
               projectState,
               userState,
            });
         }
         this.output.json(jsonResult);
         return;
      }

      let printed = 0;

      for (const { editor, result } of allResults) {
         const didPrint = this.printEditorConfig(
            editor,
            result,
            {
               sections,
               scopeFilter,
               projectState,
               userState,
            },
            printed > 0,
         );

         if (didPrint) {
            printed++;
         }
      }
   }

   private hasEditorItems(result: Awaited<ReturnType<typeof importFromEditor>>): boolean {
      return (
         Object.keys(result.mcp).length > 0 ||
         result.rules.length > 0 ||
         Object.keys(result.skills).length > 0 ||
         Object.keys(result.prompts).length > 0 ||
         Object.keys(result.agents).length > 0
      );
   }

   private buildEditorJson(
      result: Awaited<ReturnType<typeof importFromEditor>>,
      context: EditorListContext,
   ): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      const { sections, scopeFilter, projectState, userState } = context;

      if (includesSection(sections, 'mcp') && Object.keys(result.mcp).length > 0) {
         const items: Record<string, unknown> = {};

         for (const [name] of Object.entries(result.mcp)) {
            const managed = this.isAixManaged(name, 'mcp', projectState, userState);
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
            const managed = this.isAixManaged(rule.name, 'rules', projectState, userState);
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
            const managed = this.isAixManaged(name, 'skills', projectState, userState);
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
            const managed = this.isAixManaged(name, 'prompts', projectState, userState);
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
            const managed = this.isAixManaged(name, 'agents', projectState, userState);
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

      return out;
   }

   private printEditorConfig(
      editor: EditorName,
      result: Awaited<ReturnType<typeof importFromEditor>>,
      context: EditorListContext,
      addLeadingBlankLine: boolean,
   ): boolean {
      const rows = this.getEditorItemRows(result, context);

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

      return rows;
   }

   private toEditorItemRow(input: EditorItemInput, context: EditorListContext): EditorItemRow[] {
      const { type, name, section, path, detectedScope } = input,
            { scopeFilter, projectState, userState } = context;
      const managed = this.isAixManaged(name, section, projectState, userState),
            scope = detectedScope ?? managed?.scope;

      if (scopeFilter && scope !== scopeFilter) {
         return [];
      }

      return [
         {
            type,
            name,
            source: managed ? 'aix' : 'external',
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
            nameWidth = Math.max('name'.length, ...rows.map((row) => row.name.length));

      const header = `  ${'type'.padEnd(typeWidth)}  ${'scope'.padEnd(scopeWidth)}  ${'source'.padEnd(sourceWidth)}  ${'name'.padEnd(nameWidth)}  path`;

      this.output.log(chalk.dim(header));
      this.output.log(chalk.dim(`  ${'-'.repeat(header.length - 2)}`));

      for (const row of rows) {
         const type = row.type.padEnd(typeWidth),
               scope = (row.scope ?? 'unknown').padEnd(scopeWidth),
               source = row.source.padEnd(sourceWidth),
               name = row.name.padEnd(nameWidth),
               sourceColor = row.source === 'aix' ? chalk.green : chalk.dim;

         this.output.log(
            `  ${chalk.magenta(type)}  ${chalk.dim(scope)}  ${sourceColor(source)}  ${this.output.cyan(name)}  ${chalk.dim(row.path ?? '')}`,
         );
      }
   }

   private isAixManaged(
      name: string,
      section: StateSection,
      projectState: StateFile,
      userState: StateFile,
   ): { scope: 'project' | 'user' } | undefined {
      if (projectState.installed[section][name]) {
         return { scope: 'project' };
      }
      if (userState.installed[section][name]) {
         return { scope: 'user' };
      }
      return undefined;
   }
}
