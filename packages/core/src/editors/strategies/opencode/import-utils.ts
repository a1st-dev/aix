import { isAbsolute, join } from 'pathe';
import type { ImportedPromptsResult, ImportedRulesResult, EditorImportScope } from '../types.js';
import { getRuntimeAdapter, type RuntimeDirent } from '../../../runtime/index.js';
import { parseJsonc } from '@a1st/aix-schema';

interface OpenCodeConfigCommand {
   template?: unknown;
   description?: unknown;
}

interface OpenCodeConfig {
   instructions?: unknown;
   command?: Record<string, OpenCodeConfigCommand>;
}

export function getOpenCodeConfigImportPaths(configPath: string): readonly string[] {
   const jsoncPath = configPath.replace(/\.json$/, '.jsonc');

   if (jsoncPath === configPath) {
      return [configPath];
   }

   return [configPath, jsoncPath];
}

export async function importOpenCodeInstructionRules(
   configPath: string,
   baseDir: string,
   scope: EditorImportScope,
): Promise<ImportedRulesResult> {
   const warnings: string[] = [],
         rules: ImportedRulesResult['rules'] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, EditorImportScope> = {};

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { rules, paths, scopes, warnings };
   }

   if (!Array.isArray(config?.instructions)) {
      return { rules, paths, scopes, warnings };
   }

   for (const instruction of config.instructions) {
      if (typeof instruction !== 'string') {
         warnings.push(`Skipping OpenCode instruction from ${configPath}: expected string path`);
         continue;
      }

      // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
      const imported = await importOpenCodeInstructionPattern(instruction, baseDir, scope);

      rules.push(...imported.rules);
      Object.assign(paths, imported.paths);
      Object.assign(scopes, imported.scopes);
      warnings.push(...imported.warnings);
   }

   return { rules, paths, scopes, warnings };
}

export async function importOpenCodeConfigPrompts(
   configPath: string,
   scope: EditorImportScope,
): Promise<ImportedPromptsResult> {
   const prompts: Record<string, string> = {},
         paths: Record<string, string> = {},
         scopes: Record<string, EditorImportScope> = {},
         warnings: string[] = [];

   let config: OpenCodeConfig | null;

   try {
      config = await readOpenCodeConfig(configPath);
   } catch (err) {
      warnings.push(`Failed to read OpenCode config from ${configPath}: ${(err as Error).message}`);
      return { prompts, paths, scopes, warnings };
   }

   if (!config?.command) {
      return { prompts, paths, scopes, warnings };
   }

   for (const [name, command] of Object.entries(config.command)) {
      if (typeof command.template !== 'string') {
         warnings.push(`Skipping OpenCode command "${name}" from ${configPath}: missing template`);
         continue;
      }

      prompts[name] = formatOpenCodeConfigPrompt(command);
      paths[name] = configPath;
      scopes[name] = scope;
   }

   return { prompts, paths, scopes, warnings };
}

async function readOpenCodeConfig(configPath: string): Promise<OpenCodeConfig | null> {
   try {
      const parsed = parseJsonc<OpenCodeConfig>(await getRuntimeAdapter().fs.readFile(configPath, 'utf-8'));

      if (parsed.errors.length > 0 || !parsed.data) {
         throw new Error('invalid JSONC');
      }

      return parsed.data;
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return null;
      }
      throw err;
   }
}

async function importOpenCodeInstructionPattern(
   instruction: string,
   baseDir: string,
   scope: EditorImportScope,
): Promise<ImportedRulesResult> {
   const pathsToRead = hasGlobSyntax(instruction)
            ? await expandInstructionGlob(instruction, baseDir)
            : [resolveInstructionPath(instruction, baseDir)],
         rules: ImportedRulesResult['rules'] = [],
         paths: Record<string, string> = {},
         scopes: Record<string, EditorImportScope> = {},
         warnings: string[] = [];

   if (pathsToRead.length === 0) {
      warnings.push(`OpenCode instruction pattern matched no files: ${instruction}`);
   }

   for (const path of pathsToRead) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential keeps warning order deterministic
         const content = await getRuntimeAdapter().fs.readFile(path, 'utf-8'),
               name = basenameWithoutMarkdown(path);

         if (!content.trim()) {
            continue;
         }
         rules.push({ content: content.trim(), name, path, scope });
         paths[name] = path;
         scopes[name] = scope;
      } catch (err) {
         warnings.push(`Failed to read OpenCode instruction ${path}: ${(err as Error).message}`);
      }
   }

   return { rules, paths, scopes, warnings };
}

async function expandInstructionGlob(pattern: string, baseDir: string): Promise<string[]> {
   const root = isAbsolute(pattern) ? getGlobRoot(pattern) : baseDir,
         files = await listFilesRecursive(root),
         matcher = globToRegExp(isAbsolute(pattern) ? pattern : join(baseDir, pattern));

   return files.filter((file) => matcher.test(file)).toSorted();
}

async function listFilesRecursive(root: string): Promise<string[]> {
   const result: string[] = [];

   async function visit(dir: string): Promise<void> {
      let entries: RuntimeDirent[];

      try {
         entries = await getRuntimeAdapter().fs.readdir(dir, { withFileTypes: true }) as RuntimeDirent[];
      } catch {
         return;
      }

      for (const entry of entries) {
         const path = join(dir, entry.name);

         if (entry.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop -- Recursive walk is easier to reason about sequentially
            await visit(path);
         } else if (entry.isFile()) {
            result.push(path);
         }
      }
   }

   await visit(root);
   return result;
}

function hasGlobSyntax(value: string): boolean {
   return /[*?[\]{}]/.test(value);
}

function getGlobRoot(pattern: string): string {
   const parts = pattern.split('/'),
         rootParts: string[] = [];

   for (const part of parts) {
      if (hasGlobSyntax(part)) {
         break;
      }
      rootParts.push(part);
   }

   return rootParts.join('/') || '/';
}

function globToRegExp(pattern: string): RegExp {
   const segments = pattern.split('/');
   let normalized = '^',
       startIndex = 0;

   if (segments[0] === '') {
      normalized += '/';
      startIndex = 1;
   }

   for (let i = startIndex; i < segments.length; i++) {
      const segment = segments[i] ?? '',
            isLast = i === segments.length - 1;

      if (segment === '**') {
         normalized += '(?:[^/]+/)*';
         continue;
      }

      normalized += escapeGlobSegment(segment);

      if (!isLast) {
         normalized += '/';
      }
   }

   return new RegExp(`${normalized}$`);
}

function escapeGlobSegment(segment: string): string {
   return segment
      .replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
}

function resolveInstructionPath(instruction: string, baseDir: string): string {
   return isAbsolute(instruction) ? instruction : join(baseDir, instruction);
}

function basenameWithoutMarkdown(path: string): string {
   const name = path.split('/').pop() ?? 'instruction';

   return name.replace(/\.(md|markdown|txt)$/i, '');
}

function formatOpenCodeConfigPrompt(command: OpenCodeConfigCommand): string {
   if (typeof command.description !== 'string' || !command.description) {
      return String(command.template);
   }

   return `---\ndescription: ${JSON.stringify(command.description)}\n---\n\n${String(command.template)}`;
}
