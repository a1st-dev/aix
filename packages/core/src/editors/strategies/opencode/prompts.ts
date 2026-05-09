import { join } from 'pathe';
import type { EditorPrompt } from '../../types.js';
import type { ImportedPromptsResult, ParsedPromptFrontmatter, PromptsStrategy } from '../types.js';
import {
   formatPromptFile,
   hasPromptFrontmatterFields,
   parsePromptFiles,
   parsePromptFrontmatter,
} from '../shared/prompt-utils.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { getOpenCodeConfigImportPaths, importOpenCodeConfigPrompts } from './import-utils.js';

/**
 * OpenCode custom commands are markdown files in `.opencode/commands/` or
 * `~/.config/opencode/commands/`. The file body is the command template.
 */
export class OpenCodePromptsStrategy implements PromptsStrategy {
   isSupported(): boolean {
      return true;
   }

   getPromptsDir(): string {
      return 'commands';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalPromptsPath(): string | null {
      return '.config/opencode/commands';
   }

   formatPrompt(prompt: EditorPrompt): string {
      return formatPromptFile(prompt, {
         frontmatterFields: [
            { key: 'description', value: prompt.description },
            { key: 'argument-hint', value: prompt.argumentHint },
         ],
         valueFormatter: JSON.stringify,
         trailingNewline: true,
      });
   }

   async parseGlobalPrompts(
      files: string[],
      readFile: (filename: string) => Promise<string>,
   ): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
      return parsePromptFiles({
         files,
         readFile,
         includeFile: (file) => file.endsWith('.md'),
         stripSuffix: /\.md$/,
         concurrency: 5,
      });
   }

   async importGlobalPrompts(): Promise<ImportedPromptsResult> {
      return importPromptsWithConfigOverlay(
         join(getRuntimeAdapter().os.homedir(), this.getGlobalPromptsPath() ?? '.config/opencode/commands'),
         getOpenCodeConfigImportPaths(join(getRuntimeAdapter().os.homedir(), '.config', 'opencode', 'opencode.json')),
         'user',
         this,
      );
   }

   async importProjectPrompts(projectRoot: string, editorConfigDir: string): Promise<ImportedPromptsResult> {
      return importPromptsWithConfigOverlay(
         join(projectRoot, editorConfigDir, this.getPromptsDir()),
         getOpenCodeConfigImportPaths(join(projectRoot, 'opencode.json')),
         'project',
         this,
      );
   }

   detectFormat(content: string): boolean {
      return hasPromptFrontmatterFields(content, ['description']);
   }

   parseFrontmatter(rawContent: string): ParsedPromptFrontmatter {
      return parsePromptFrontmatter(rawContent, ['description', 'argument-hint']);
   }
}

async function importPromptsWithConfigOverlay(
   promptsDir: string,
   configPaths: readonly string[],
   scope: 'project' | 'user',
   strategy: OpenCodePromptsStrategy,
): Promise<ImportedPromptsResult> {
   const directoryPrompts = await importPromptDirectory(promptsDir, scope, strategy);

   for (const configPath of configPaths) {
      // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
      const configPrompts = await importOpenCodeConfigPrompts(configPath, scope);

      if (Object.keys(configPrompts.prompts).length > 0 || configPrompts.warnings.length > 0) {
         return mergePromptImports(configPrompts, directoryPrompts);
      }
   }

   return directoryPrompts;
}

async function importPromptDirectory(
   fullPath: string,
   scope: 'project' | 'user',
   strategy: OpenCodePromptsStrategy,
): Promise<ImportedPromptsResult> {
   const warnings: string[] = [];

   try {
      const files = await getRuntimeAdapter().fs.readdir(fullPath),
            result = await strategy.parseGlobalPrompts(files, (filename) => {
               return getRuntimeAdapter().fs.readFile(join(fullPath, filename), 'utf-8');
            });

      return {
         ...result,
         paths: promptPathMap(Object.keys(result.prompts), files, fullPath),
         scopes: scopeMapForNames(Object.keys(result.prompts), scope),
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
         warnings.push(`Failed to read prompts from ${fullPath}: ${(err as Error).message}`);
      }
   }

   return { prompts: {}, paths: {}, scopes: {}, warnings };
}

function mergePromptImports(
   base: ImportedPromptsResult,
   overlay: ImportedPromptsResult,
): ImportedPromptsResult {
   return {
      prompts: { ...base.prompts, ...overlay.prompts },
      paths: { ...base.paths, ...overlay.paths },
      scopes: { ...base.scopes, ...overlay.scopes },
      warnings: [...base.warnings, ...overlay.warnings],
   };
}

function promptPathMap(names: string[], files: string[], basePath: string): Record<string, string> {
   const fileByName = new Map(files.map((file) => [file.replace(/\.md$/, ''), file]));

   return Object.fromEntries(
      names.flatMap((name) => {
         const file = fileByName.get(name);

         return file ? [[name, join(basePath, file)]] : [];
      }),
   );
}

function scopeMapForNames(
   names: string[],
   scope: 'project' | 'user',
): Record<string, 'project' | 'user'> {
   return Object.fromEntries(names.map((name) => [name, scope]));
}
