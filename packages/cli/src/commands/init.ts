import { Flags } from '@oclif/core';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BaseCommand } from '../base-command.js';
import { createEmptyConfig, type AiJsonConfig } from '@a1st/aix-schema';
import {
   importFromEditor,
   getAvailableEditors,
   writeImportedContent,
   commitImport,
   rollbackImport,
   type EditorName,
} from '@a1st/aix-core';

export default class Init extends BaseCommand<typeof Init> {
   static override description = 'Initialize a new ai.json configuration file';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --force',
      '<%= config.bin %> <%= command.id %> --from windsurf',
      '<%= config.bin %> <%= command.id %> --from cursor --force',
   ];

   static override flags = {
      force: Flags.boolean({
         char: 'f',
         description: 'Overwrite existing ai.json',
         default: false,
      }),
      from: Flags.string({
         description: `Import global config from an editor (${getAvailableEditors().join(', ')})`,
         options: getAvailableEditors(),
      }),
   };

   async run(): Promise<void> {
      const configPath = join(process.cwd(), 'ai.json');

      if (existsSync(configPath) && !this.flags.force) {
         this.error('ai.json already exists. Use --force to overwrite.');
      }

      let config: AiJsonConfig;
      const editor = this.flags.from as EditorName | undefined;

      if (editor) {
         try {
            config = await this.importFromEditorConfig(editor);
            await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
            await commitImport(process.cwd());
         } catch (error) {
            await rollbackImport(process.cwd());
            throw error;
         }
      } else {
         config = createEmptyConfig();
         await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
      }

      this.output.success(`Created ${configPath}`);

      if (this.flags.json) {
         this.output.json({ path: configPath, config });
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

      // Write imported content to .aix/imported/ and get path references
      const written = await writeImportedContent(process.cwd(), result);

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
         ...createEmptyConfig(),
         mcp: result.mcp,
         rules,
         skills: result.skills,
         prompts,
      };
   }
}
