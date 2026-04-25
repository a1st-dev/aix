import { Flags } from '@oclif/core';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { BaseCommand } from '../base-command.js';
import { createEmptyConfig, type AiJsonConfig } from '@a1st/aix-schema';
import { configScopeFlags, resolveConfigScope } from '../flags/scope.js';
import {
   importFromEditor,
   normalizeEditorImport,
   getAvailableEditors,
   writeImportedContent,
   commitImport,
   rollbackImport,
   validateReference,
   buildConfigFromEditorImport,
   generateAndWriteLockfile,
   loadConfig,
   type EditorName,
} from '@a1st/aix-core';

export default class Init extends BaseCommand<typeof Init> {
   static override description = 'Initialize a new ai.json configuration file';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --force',
      '<%= config.bin %> <%= command.id %> --from windsurf',
      '<%= config.bin %> <%= command.id %> --from cursor --force',
      '<%= config.bin %> <%= command.id %> --extends github:org/shared-config',
      '<%= config.bin %> <%= command.id %> --extends ./configs/base.json',
      '<%= config.bin %> <%= command.id %> --scope user',
   ];

   static override flags = {
      ...configScopeFlags,
      force: Flags.boolean({
         char: 'f',
         description: 'Overwrite existing ai.json',
         default: false,
      }),
      from: Flags.string({
         description: `Import supported config from an editor (${getAvailableEditors().join(', ')})`,
         options: getAvailableEditors(),
      }),
      extends: Flags.string({
         char: 'e',
         description: 'Extend from another ai.json (local path, URL, git shorthand)',
      }),
      lock: Flags.boolean({
         description: 'Create ai.lock.json beside ai.json',
         default: false,
      }),
   };

   async run(): Promise<void> {
      const configPath = join(process.cwd(), 'ai.json');

      if (existsSync(configPath) && !this.flags.force) {
         this.error('ai.json already exists. Use --force to overwrite.');
      }

      const scopeFlag = resolveConfigScope(
         this.flags as { scope?: string; user?: boolean; project?: boolean },
         'project',
      );
      // Only pass scope when user explicitly asked for "user"
      const scope = scopeFlag === 'user' ? 'user' : undefined;

      let config: AiJsonConfig;
      const editor = this.flags.from as EditorName | undefined;

      // Validate and normalize --extends value
      let extendsValue: string | undefined;

      if (this.flags.extends) {
         try {
            const validated = validateReference(this.flags.extends, '--extends');

            extendsValue = validated.normalized;
         } catch (error) {
            this.error(error instanceof Error ? error.message : String(error));
         }
      }

      if (editor) {
         try {
            config = await this.importFromEditorConfig(editor);
            if (extendsValue) {
               config.extends = extendsValue;
            }
            if (scope) {
               (config as Record<string, unknown>).scope = scope;
            }
            await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
            await commitImport(process.cwd());
         } catch (error) {
            await rollbackImport(process.cwd());
            throw error;
         }
      } else {
         config = createEmptyConfig(scope);
         if (extendsValue) {
            config.extends = extendsValue;
         }
         await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
      }

      this.output.success(`Created ${configPath}`);

      if (this.flags.lock) {
         const loaded = await loadConfig({ explicitPath: configPath, lockfileMode: 'ignore' });

         if (!loaded) {
            this.error(`Could not load ${configPath} after creating it.`);
         }

         const written = await generateAndWriteLockfile({
            config: loaded.config,
            configPath,
            configBaseDir: loaded.configBaseDir,
            projectRoot: process.cwd(),
         });

         this.output.success(`Created ${written.lockfilePath}`);
      }

      if (this.flags.json) {
         this.output.json({
            path: configPath,
            config,
            ...(this.flags.lock && { lockfilePath: join(process.cwd(), 'ai.lock.json') }),
         });
      }
   }

   private async importFromEditorConfig(editor: EditorName): Promise<AiJsonConfig> {
      const projectRoot = process.cwd(),
            result = await importFromEditor(editor, { projectRoot });

      // Show what sources were found
      if (result.sources.global && result.sources.local) {
         this.output.info(`Importing from ${editor} (global + local project config)`);
      } else if (result.sources.global) {
         this.output.info(`Importing from ${editor} (global config)`);
      } else if (result.sources.local) {
         this.output.info(`Importing from ${editor} (local project config)`);
      }

      // Show warnings
      for (const warning of result.warnings) {
         this.output.warn(warning);
      }

      const mcpCount = Object.keys(result.mcp).length,
            rulesCount = result.rules.length,
            skillsCount = Object.keys(result.skills).length,
            promptsCount = Object.keys(result.prompts).length;

      if (mcpCount > 0) {
         this.output.success(`Imported ${mcpCount} MCP server${mcpCount === 1 ? '' : 's'}`);
      }

      if (rulesCount > 0) {
         this.output.success(`Imported ${rulesCount} rule${rulesCount === 1 ? '' : 's'}`);
      }

      if (skillsCount > 0) {
         this.output.success(`Imported ${skillsCount} skill${skillsCount === 1 ? '' : 's'}`);
      }

      if (promptsCount > 0) {
         this.output.success(`Imported ${promptsCount} prompt${promptsCount === 1 ? '' : 's'}`);
      }

      if (mcpCount === 0 && rulesCount === 0 && skillsCount === 0 && promptsCount === 0) {
         this.output.warn('No configuration found to import');
      }

      const normalized = normalizeEditorImport(editor, result),
            written = await writeImportedContent(process.cwd(), {
               rules: normalized.rules.map((rule) => ({
                  name: rule.name,
                  content: rule.rawContent,
               })),
               prompts: Object.fromEntries(
                  normalized.prompts.map((prompt) => [prompt.name, prompt.rawContent]),
               ),
            }),
            config = buildConfigFromEditorImport(editor, result);

      // Build rules object with path references
      const rules: Record<string, { path: string }> = {};

      for (const [name, relativePath] of Object.entries(written.rules)) {
         rules[name] = { path: relativePath };
      }

      // Build prompts object with path references
      const prompts: Record<string, { path: string }> = {};

      for (const [name, relativePath] of Object.entries(written.prompts)) {
         prompts[name] = { path: relativePath };
      }

      return {
         ...config,
         rules,
         prompts,
      };
   }
}
