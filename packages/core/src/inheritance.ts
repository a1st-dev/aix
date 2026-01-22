import { resolve, dirname } from 'pathe';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { downloadTemplate } from 'giget';
import { parseJsonc, detectSourceType } from '@a1st/aix-schema';
import { parseConfigContent } from './discovery.js';
import { CircularDependencyError, ConfigParseError, RemoteFetchError } from './errors.js';
import { convertBlobToRawUrl } from './url-parsing.js';
import { deepMergeJson } from './json.js';
import type { AiJsonConfig } from '@a1st/aix-schema';

export interface ResolveOptions {
   baseDir: string;
   visited?: Set<string>;
   /** Whether the baseDir is a remote URL (for resolving relative extends) */
   isRemote?: boolean;
}

export async function resolveExtends(
   config: Record<string, unknown>,
   options: ResolveOptions,
): Promise<AiJsonConfig> {
   const { baseDir, visited = new Set<string>(), isRemote = false } = options;

   if (!config.extends) {
      return config as AiJsonConfig;
   }

   const extendsValue = config.extends,
         extendsList = Array.isArray(extendsValue) ? extendsValue : [extendsValue];

   let merged: Record<string, unknown> = {};

   // Process extends sequentially - order matters for proper inheritance chain
   for (const extendPath of extendsList) {
      if (typeof extendPath !== 'string') {
         continue;
      }

      // eslint-disable-next-line no-await-in-loop -- Sequential: inheritance chain order matters
      const resolvedConfig = await resolveExtendsPath(extendPath, baseDir, visited, isRemote);

      merged = deepMergeJson(merged, resolvedConfig, { resolver: aiJsonMergeResolver });
   }

   const { extends: _, ...currentConfig } = config;

   merged = deepMergeJson(merged, currentConfig, { resolver: aiJsonMergeResolver });

   return merged as AiJsonConfig;
}

async function resolveExtendsPath(
   extendPath: string,
   baseDir: string,
   visited: Set<string>,
   isRemote: boolean,
): Promise<Record<string, unknown>> {
   // If base is a remote URL and extend is a relative path, resolve as remote URL
   if (isRemote && isRelativePath(extendPath)) {
      return resolveRemoteExtends(new URL(extendPath, baseDir).href, visited);
   }

   const sourceType = detectSourceType(extendPath);

   switch (sourceType) {
   case 'local':
      return resolveLocalExtends(extendPath, baseDir, visited);

   case 'git-shorthand':
   case 'https-file':
   case 'https-repo':
      return resolveGitExtends(extendPath, visited);

   case 'npm':
      return resolveNpmExtends(extendPath, visited);

   case 'http-unsupported':
      throw new ConfigParseError('HTTP URLs are not supported (use HTTPS)', extendPath);
   }
}

function isRelativePath(path: string): boolean {
   return path.startsWith('./') || path.startsWith('../');
}

/**
 * Resolve extends from a remote URL (fetch the file directly).
 */
async function resolveRemoteExtends(
   url: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   if (visited.has(url)) {
      throw new CircularDependencyError([...visited, url]);
   }
   visited.add(url);

   const rawUrl = convertBlobToRawUrl(url);

   let content: string;

   try {
      const response = await fetch(rawUrl);

      if (!response.ok) {
         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      content = await response.text();
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(url, message);
   }

   const result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, url);
   }

   const parsed = result.data as Record<string, unknown>,
         newBaseUrl = rawUrl.substring(0, rawUrl.lastIndexOf('/') + 1);

   return resolveExtends(parsed, { baseDir: newBaseUrl, visited, isRemote: true });
}

async function resolveLocalExtends(
   extendPath: string,
   baseDir: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   const absolutePath = resolve(baseDir, extendPath);

   if (visited.has(absolutePath)) {
      throw new CircularDependencyError([...visited, absolutePath]);
   }

   if (!existsSync(absolutePath)) {
      throw new ConfigParseError(`Extended config not found: ${extendPath}`, absolutePath);
   }

   visited.add(absolutePath);

   const content = readFileSync(absolutePath, 'utf-8'),
         parsed = parseConfigContent(content) as Record<string, unknown>,
         newBaseDir = dirname(absolutePath);

   return resolveExtends(parsed, { baseDir: newBaseDir, visited });
}

async function resolveGitExtends(
   extendPath: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   if (visited.has(extendPath)) {
      throw new CircularDependencyError([...visited, extendPath]);
   }

   visited.add(extendPath);

   const { dir } = await downloadTemplate(extendPath, {
      force: false,
      cwd: process.cwd(),
   });

   const configPath = resolve(dir, 'ai.json');

   if (!existsSync(configPath)) {
      throw new ConfigParseError(`No ai.json found in git repository: ${extendPath}`, configPath);
   }

   const content = readFileSync(configPath, 'utf-8'),
         parsed = parseConfigContent(content) as Record<string, unknown>;

   return resolveExtends(parsed, { baseDir: dir, visited });
}

async function resolveNpmExtends(
   packageName: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   if (visited.has(packageName)) {
      throw new CircularDependencyError([...visited, packageName]);
   }

   visited.add(packageName);

   try {
      // Use ESM-compatible import.meta.resolve to find the package
      const resolvedUrl = import.meta.resolve(`${packageName}/ai.json`, `file://${process.cwd()}/`);
      const packagePath = fileURLToPath(resolvedUrl);

      const content = readFileSync(packagePath, 'utf-8'),
            parsed = parseConfigContent(content) as Record<string, unknown>,
            baseDir = dirname(packagePath);

      return resolveExtends(parsed, { baseDir, visited });
   } catch (_error) {
      throw new ConfigParseError(
         `Failed to resolve npm package: ${packageName}. Make sure it's installed.`,
         packageName,
      );
   }
}

/**
 * Merge resolver for ai.json inheritance. Skips the `extends` key since it's handled separately.
 */
function aiJsonMergeResolver({ key }: { key: string }): 'keep' | undefined {
   if (key === 'extends') {
      return 'keep';
   }
   return undefined;
}
