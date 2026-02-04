import { resolve, dirname, isAbsolute } from 'pathe';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJsonc, detectSourceType, isLocalPath } from '@a1st/aix-schema';
import { withGitDownload } from './git-download.js';
import { parseConfigContent } from './discovery.js';
import { CircularDependencyError, ConfigParseError, RemoteFetchError } from './errors.js';
import { convertBlobToRawUrl } from './url-parsing.js';
import { deepMergeJson } from './json.js';
import type { AiJsonConfig } from '@a1st/aix-schema';

export interface ResolveOptions {
   baseDir: string;
   /** Project root for determining temp directory location */
   projectRoot: string;
   visited?: Set<string>;
   /** Whether the baseDir is a remote URL (for resolving relative extends) */
   isRemote?: boolean;
}

export async function resolveExtends(
   config: Record<string, unknown>,
   options: ResolveOptions,
): Promise<AiJsonConfig> {
   const { baseDir, projectRoot, visited = new Set<string>(), isRemote = false } = options;

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
      const resolvedConfig = await resolveExtendsPath(extendPath, {
         baseDir,
         projectRoot,
         visited,
         isRemote,
      });

      merged = deepMergeJson(merged, resolvedConfig, { resolver: aiJsonMergeResolver });
   }

   const { extends: _, ...currentConfig } = config;

   merged = deepMergeJson(merged, currentConfig, { resolver: aiJsonMergeResolver });

   return merged as AiJsonConfig;
}

interface ResolveExtendsPathOptions {
   baseDir: string;
   projectRoot: string;
   visited: Set<string>;
   isRemote: boolean;
}

async function resolveExtendsPath(
   extendPath: string,
   options: ResolveExtendsPathOptions,
): Promise<Record<string, unknown>> {
   const { baseDir, projectRoot, visited, isRemote } = options;

   // If base is a remote URL and extend is a relative path, resolve as remote URL
   if (isRemote && isRelativePath(extendPath)) {
      return resolveRemoteExtends(new URL(extendPath, baseDir).href, projectRoot, visited);
   }

   const sourceType = detectSourceType(extendPath);

   switch (sourceType) {
   case 'local':
      return resolveLocalExtends(extendPath, baseDir, projectRoot, visited);

   case 'https-file':
      return resolveRemoteExtends(extendPath, projectRoot, visited);

   case 'git-shorthand':
   case 'https-repo':
      return resolveGitExtends(extendPath, projectRoot, visited);

   case 'npm':
      return resolveNpmExtends(extendPath, projectRoot, visited);

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
   projectRoot: string,
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

   return resolveExtends(parsed, { baseDir: newBaseUrl, projectRoot, visited, isRemote: true });
}

async function resolveLocalExtends(
   extendPath: string,
   baseDir: string,
   projectRoot: string,
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

   return resolveExtends(parsed, { baseDir: newBaseDir, projectRoot, visited });
}

async function resolveGitExtends(
   extendPath: string,
   projectRoot: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   if (visited.has(extendPath)) {
      throw new CircularDependencyError([...visited, extendPath]);
   }

   visited.add(extendPath);

   return withGitDownload(extendPath, projectRoot, async (dir) => {
      const configPath = resolve(dir, 'ai.json');

      if (!existsSync(configPath)) {
         throw new ConfigParseError(`No ai.json found in git repository: ${extendPath}`, configPath);
      }

      const content = readFileSync(configPath, 'utf-8'),
            parsed = parseConfigContent(content) as Record<string, unknown>,
            resolved = await resolveExtends(parsed, { baseDir: dir, projectRoot, visited });

      // Normalize local paths to absolute so they remain valid after merging into the parent config
      return normalizeLocalPaths(resolved, dir);
   });
}

async function resolveNpmExtends(
   packageName: string,
   projectRoot: string,
   visited: Set<string>,
): Promise<Record<string, unknown>> {
   if (visited.has(packageName)) {
      throw new CircularDependencyError([...visited, packageName]);
   }

   visited.add(packageName);

   try {
      // Use ESM-compatible import.meta.resolve to find the package
      const resolvedUrl = import.meta.resolve(`${packageName}/ai.json`, `file://${process.cwd()}/`),
            packagePath = fileURLToPath(resolvedUrl),
            content = readFileSync(packagePath, 'utf-8'),
            parsed = parseConfigContent(content) as Record<string, unknown>,
            baseDir = dirname(packagePath),
            resolved = await resolveExtends(parsed, { baseDir, projectRoot, visited });

      // Normalize local paths to absolute so they remain valid after merging into the parent config
      return normalizeLocalPaths(resolved, baseDir);
   } catch (error) {
      if (error instanceof ConfigParseError || error instanceof CircularDependencyError) {
         throw error;
      }
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

/**
 * Normalize local paths in a config to absolute paths. This ensures that skills, rules, and prompts
 * from extended configs (git, npm) remain resolvable after merging into the parent config.
 */
function normalizeLocalPaths(
   config: Record<string, unknown>,
   baseDir: string,
): Record<string, unknown> {
   const result = { ...config };

   // Normalize skills
   if (result.skills && typeof result.skills === 'object') {
      result.skills = normalizeSkillPaths(result.skills as Record<string, unknown>, baseDir);
   }

   // Normalize rules
   if (result.rules && typeof result.rules === 'object') {
      result.rules = normalizeRulePaths(result.rules as Record<string, unknown>, baseDir);
   }

   // Normalize prompts
   if (result.prompts && typeof result.prompts === 'object') {
      result.prompts = normalizePromptPaths(result.prompts as Record<string, unknown>, baseDir);
   }

   return result;
}

/**
 * Normalize skill reference paths to absolute paths.
 */
function normalizeSkillPaths(
   skills: Record<string, unknown>,
   baseDir: string,
): Record<string, unknown> {
   const result: Record<string, unknown> = {};

   for (const [name, ref] of Object.entries(skills)) {
      result[name] = normalizeSourceRef(ref, baseDir);
   }

   return result;
}

/**
 * Normalize a source reference (skill, rule, prompt) to use absolute paths for local refs.
 */
function normalizeSourceRef(ref: unknown, baseDir: string): unknown {
   if (ref === false || ref === null || ref === undefined) {
      return ref;
   }

   // String shorthand (version range, local path, or git shorthand)
   if (typeof ref === 'string') {
      return normalizePathString(ref, baseDir);
   }

   // Object with path property (local ref)
   if (typeof ref === 'object' && ref !== null) {
      const obj = ref as Record<string, unknown>;

      // { path: "./skills/foo" } → { path: "/abs/path/skills/foo" }
      if ('path' in obj && typeof obj.path === 'string') {
         return { ...obj, path: normalizePathString(obj.path, baseDir) };
      }

      // { source: "./skills/foo" } or { source: { path: "..." } }
      if ('source' in obj) {
         return { ...obj, source: normalizeSourceRef(obj.source, baseDir) };
      }
   }

   return ref;
}

/**
 * Normalize a path string to absolute if it's a local path.
 */
function normalizePathString(value: string, baseDir: string): string {
   // Skip if already absolute
   if (isAbsolute(value)) {
      return value;
   }

   // Only normalize local paths (not git refs, npm packages, URLs, etc.)
   if (!isLocalPath(value)) {
      return value;
   }

   return resolve(baseDir, value);
}

/**
 * Normalize rule paths to absolute paths.
 */
function normalizeRulePaths(
   rules: Record<string, unknown>,
   baseDir: string,
): Record<string, unknown> {
   const result: Record<string, unknown> = {};

   for (const [key, value] of Object.entries(rules)) {
      if (Array.isArray(value)) {
         // Array of rule strings or paths
         result[key] = value.map((item) =>
            typeof item === 'string' ? normalizePathString(item, baseDir) : item,
         );
      } else if (typeof value === 'string') {
         result[key] = normalizePathString(value, baseDir);
      } else {
         result[key] = value;
      }
   }

   return result;
}

/**
 * Normalize prompt paths to absolute paths.
 */
function normalizePromptPaths(
   prompts: Record<string, unknown>,
   baseDir: string,
): Record<string, unknown> {
   const result: Record<string, unknown> = {};

   for (const [key, value] of Object.entries(prompts)) {
      if (Array.isArray(value)) {
         result[key] = value.map((item) =>
            typeof item === 'string' ? normalizePathString(item, baseDir) : item,
         );
      } else if (typeof value === 'string') {
         result[key] = normalizePathString(value, baseDir);
      } else {
         result[key] = value;
      }
   }

   return result;
}
