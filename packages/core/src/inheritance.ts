import { resolve, dirname, join } from 'pathe';
import { detectSourceType, isLocalPath, hooksSchema, type HookAction } from '@a1st/aix-schema';
import { withGitDownload, createCacheKey, createDownloadKey } from './git-download.js';
import { getExtendsDir } from './cache/paths.js';
import { parseConfigContent } from './discovery.js';
import { safeRm } from './fs/safe-rm.js';
import {
   CircularDependencyError,
   ConfigParseError,
   RemoteFetchError,
   UnsupportedRuntimeCapabilityError,
} from './errors.js';
import { fetchWithTimeout } from './remote-loader.js';
import { convertBlobToRawUrl } from './url-parsing.js';
import { deepMergeJson } from './json.js';
import type { AiJsonConfig } from '@a1st/aix-schema';
import { getRuntimeAdapter } from './runtime/index.js';
import { isRecord } from './type-guards.js';

const SOURCE_REF_SECTIONS = ['skills', 'rules', 'prompts', 'agents'] as const,
      FILE_PROTOCOL = 'file:',
      // Files that decide what `npm install` puts in node_modules
      DEPENDENCY_MANIFESTS = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc'] as const,
      INSTALL_FINGERPRINT_FILE = '.aix-install-fingerprint';

export interface ResolveOptions {
   baseDir: string;
   /** Project root for determining temp directory location */
   projectRoot: string;
   /** Whether the baseDir is a remote URL (for resolving relative extends) */
   isRemote?: boolean;
   /**
    * Whether a git `extends` may run a package manager to install the packages its hook scripts
    * import. Defaults to true. Pass false for a load that only reads the config, such as a
    * validation or a dry run, so that looking at a config never installs anything.
    */
   installDependencies?: boolean;
}

/** State shared by every config in one `resolveExtends` call */
interface ExtendsContext {
   projectRoot: string;
   installDependencies: boolean;
   /** Names of the copies under `.aix/extends/` that the resolved config points into */
   usedExtendsKeys: Set<string>;
}

interface ExtendsChainOptions {
   baseDir: string;
   context: ExtendsContext;
   /** The chain of extended configs that led to this one, used to detect cycles */
   visited: ReadonlySet<string>;
   isRemote: boolean;
}

export async function resolveExtends(
   config: Record<string, unknown>,
   options: ResolveOptions,
): Promise<AiJsonConfig> {
   const { baseDir, projectRoot, isRemote = false, installDependencies = true } = options,
         context: ExtendsContext = { projectRoot, installDependencies, usedExtendsKeys: new Set<string>() },
         resolved = await resolveExtendsChain(config, { baseDir, context, visited: new Set<string>(), isRemote });

   if (config.extends) {
      await removeUnusedExtendsCopies(context);
   }

   return resolved;
}

/**
 * Remove the copies under `.aix/extends/` that the config no longer extends. This runs only
 * after the whole config has resolved: installed hooks point into these copies, so a load
 * that fails (for example while offline) must leave them as they were.
 */
async function removeUnusedExtendsCopies(context: ExtendsContext): Promise<void> {
   const extendsDir = getExtendsDir(context.projectRoot),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(extendsDir)) {
      return;
   }

   const unusedKeys = (await fs.readdir(extendsDir)).filter((key) => {
      return !context.usedExtendsKeys.has(key);
   });

   await Promise.all(unusedKeys.map((key) => {
      return safeRm(join(extendsDir, key), { force: true });
   }));
}

async function resolveExtendsChain(
   config: Record<string, unknown>,
   options: ExtendsChainOptions,
): Promise<AiJsonConfig> {
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
      const resolvedConfig = await resolveExtendsPath(extendPath, options);

      merged = mergeInheritedConfig(merged, resolvedConfig);
   }

   const { extends: _, ...currentConfig } = config;

   merged = mergeInheritedConfig(merged, currentConfig);

   return merged as AiJsonConfig;
}

/** For fields of which an item sets exactly one: each field supersedes all the others. */
function mutuallyExclusive(fields: readonly string[]): Record<string, readonly string[]> {
   return Object.fromEntries(fields.map((field) => {
      return [ field, fields.filter((other) => {
         return other !== field;
      }) ];
   }));
}

const CONTENT_SOURCE_FIELDS = mutuallyExclusive([ 'content', 'path', 'git', 'npm' ]);

/** Per section, the fields of an inherited item that give way when an override sets the key. */
const SUPERSEDED_FIELDS: Record<string, Record<string, readonly string[]>> = {
   rules: CONTENT_SOURCE_FIELDS,
   prompts: CONTENT_SOURCE_FIELDS,
   agents: CONTENT_SOURCE_FIELDS,
   mcp: { command: [ 'url', 'headers' ], url: [ 'command', 'args' ] },
};

/**
 * Items are merged field by field, so an overriding config can change one field of an inherited
 * item. Some fields exclude each other, though: a rule has one content source and an MCP server
 * one transport. When the override picks a different one, the inherited choice has to go, or
 * the merged item would carry both and fail validation with neither config being wrong.
 */
function dropSupersededFields(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
   const result = { ...base };

   for (const [ section, supersededBy ] of Object.entries(SUPERSEDED_FIELDS)) {
      const baseItems = base[section],
            overrideItems = override[section];

      if (!isRecord(baseItems) || !isRecord(overrideItems)) {
         continue;
      }

      const items = { ...baseItems };

      for (const [ name, overrideItem ] of Object.entries(overrideItems)) {
         const baseItem = baseItems[name];

         if (!isRecord(baseItem) || !isRecord(overrideItem)) {
            continue;
         }

         const superseded = new Set(Object.keys(overrideItem).flatMap((field) => {
            return supersededBy[field] ?? [];
         }));

         items[name] = Object.fromEntries(Object.entries(baseItem).filter(([ field ]) => {
            return !superseded.has(field);
         }));
      }
      result[section] = items;
   }

   return result;
}

function mergeInheritedConfig(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
   return deepMergeJson(dropSupersededFields(base, override), override, { resolver: aiJsonMergeResolver });
}

async function resolveExtendsPath(
   extendPath: string,
   options: ExtendsChainOptions,
): Promise<Record<string, unknown>> {
   const { baseDir, context, visited, isRemote } = options;

   // If base is a remote URL and extend is a relative path, resolve as remote URL
   if (isRemote && isRelativePath(extendPath)) {
      return resolveRemoteExtends(new URL(extendPath, baseDir).href, context, visited);
   }

   const sourceType = detectSourceType(extendPath);

   switch (sourceType) {
      case 'local':
         return resolveLocalExtends(extendPath, baseDir, context, visited);

      case 'https-file':
         return resolveRemoteExtends(extendPath, context, visited);

      case 'git-shorthand':
      case 'https-repo':
         return resolveGitExtends(extendPath, context, visited);

      case 'npm':
         return resolveNpmExtends(extendPath, context, visited);

      case 'http-unsupported':
         throw new ConfigParseError('HTTP URLs are not supported (use HTTPS)', extendPath);
   }
}

function isRelativePath(path: string): boolean {
   return path.startsWith('./') || path.startsWith('../');
}

/**
 * Extend the chain of configs being resolved with `source`. The chain is copied rather than
 * mutated so that sibling `extends` entries do not see each other: two configs may share a
 * base, and only a config that extends one of its own ancestors is a cycle.
 */
function enterExtends(visited: ReadonlySet<string>, source: string): ReadonlySet<string> {
   if (visited.has(source)) {
      throw new CircularDependencyError([...visited, source]);
   }

   return new Set([...visited, source]);
}

/**
 * Parse the content of an extended config. A failure names that config rather than the one
 * that extends it, so the error points at the file that has to be fixed.
 */
function parseExtendedConfig(content: string, source: string): Record<string, unknown> {
   let parsed: unknown;

   try {
      parsed = parseConfigContent(content);
   } catch (error) {
      throw new ConfigParseError(error instanceof Error ? error.message : String(error), source);
   }

   if (!isRecord(parsed)) {
      throw new ConfigParseError('Expected a JSON object', source);
   }

   return parsed;
}

/**
 * Resolve extends from a remote URL (fetch the file directly).
 */
async function resolveRemoteExtends(
   url: string,
   context: ExtendsContext,
   visited: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
   const chain = enterExtends(visited, url),
         rawUrl = convertBlobToRawUrl(url);

   let content: string;

   try {
      content = await fetchWithTimeout(rawUrl);
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(url, message);
   }

   const parsed = parseExtendedConfig(content, url),
         newBaseUrl = rawUrl.substring(0, rawUrl.lastIndexOf('/') + 1);

   return resolveExtendsChain(parsed, { baseDir: newBaseUrl, context, visited: chain, isRemote: true });
}

async function resolveLocalExtends(
   extendPath: string,
   baseDir: string,
   context: ExtendsContext,
   visited: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
   const absolutePath = resolve(baseDir, extendPath),
         chain = enterExtends(visited, absolutePath),
         { fs } = getRuntimeAdapter();

   if (!fs.existsSync(absolutePath)) {
      throw new ConfigParseError(`Extended config not found: ${extendPath}`, absolutePath);
   }

   const parsed = parseExtendedConfig(fs.readFileSync(absolutePath, 'utf-8'), absolutePath),
         newBaseDir = dirname(absolutePath),
         resolved = await resolveExtendsChain(parsed, { baseDir: newBaseDir, context, visited: chain, isRemote: false });

   // Normalize local paths to absolute so they remain valid after merging into the parent config,
   // which may be in a different directory.
   return normalizeLocalPaths(resolved, newBaseDir);
}

async function resolveGitExtends(
   extendPath: string,
   context: ExtendsContext,
   visited: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
   const chain = enterExtends(visited, extendPath),
         extendsKey = createDownloadKey(extendPath),
         permanentDir = join(getExtendsDir(context.projectRoot), extendsKey),
         { fs } = getRuntimeAdapter();

   context.usedExtendsKeys.add(extendsKey);

   // Skill, rule and prompt paths and installed hook commands keep pointing at the copy under
   // .aix/extends/ after this load. It is replaced only once the download has an ai.json that
   // parses and its dependencies are in place, so a failed load leaves the old copy usable.
   const parsed = await withGitDownload(extendPath, context.projectRoot, async (dir) => {
      const configPath = resolve(dir, 'ai.json');

      if (!fs.existsSync(configPath)) {
         throw new ConfigParseError(`No ai.json found in git repository: ${extendPath}`, configPath);
      }

      const config = parseExtendedConfig(fs.readFileSync(configPath, 'utf-8'), configPath),
            installedConfigPath = resolve(permanentDir, 'ai.json');

      if (!context.installDependencies && needsDependencyInstall(dir, permanentDir)) {
         // This load may not install, and the download cannot replace the copy without its
         // packages: installed hooks run scripts from that copy. Keep reading the copy as it
         // was installed. The next load that may install picks up the new version.
         if (fs.existsSync(installedConfigPath)) {
            return parseExtendedConfig(fs.readFileSync(installedConfigPath, 'utf-8'), installedConfigPath);
         }
      } else {
         await installExtendsDependencies(dir, permanentDir);
      }
      await fs.mkdir(dirname(permanentDir), { recursive: true });
      await safeRm(permanentDir, { force: true });
      await fs.rename(dir, permanentDir);

      return config;
   });

   const resolved = await resolveExtendsChain(parsed, { baseDir: permanentDir, context, visited: chain, isRemote: false });

   return normalizeLocalPaths(resolved, permanentDir);
}

/** A digest of a directory's dependency manifests, or nothing when it declares no packages. */
function getDependencyFingerprint(dir: string): string | undefined {
   const { fs } = getRuntimeAdapter();

   if (!fs.existsSync(join(dir, 'package.json'))) {
      return undefined;
   }

   return createCacheKey(...DEPENDENCY_MANIFESTS.map((name) => {
      return fs.existsSync(join(dir, name)) ? fs.readFileSync(join(dir, name), 'utf-8') : undefined;
   }));
}

/**
 * Whether a downloaded extends copy has to have the package manager run on it. It does not
 * when it declares no packages, or when the copy it replaces was installed from the same
 * manifests and can hand its packages over.
 */
function needsDependencyInstall(dir: string, previousDir: string): boolean {
   const { fs } = getRuntimeAdapter(),
         fingerprint = getDependencyFingerprint(dir),
         canTakeOverPackages = !fs.existsSync(join(dir, 'node_modules')) &&
            readInstallFingerprint(join(previousDir, 'node_modules')) === fingerprint;

   return fingerprint !== undefined && !canTakeOverPackages;
}

/**
 * Give a downloaded extends copy the packages that its hook scripts import. The package
 * manager runs only when the dependency manifests differ from those the copy being replaced
 * was installed from; otherwise that copy's packages are moved over, so that loading a config
 * does not reinstall every time.
 */
async function installExtendsDependencies(dir: string, previousDir: string): Promise<void> {
   const { fs, npm } = getRuntimeAdapter(),
         modulesDir = join(dir, 'node_modules'),
         previousModulesDir = join(previousDir, 'node_modules'),
         fingerprint = getDependencyFingerprint(dir);

   if (fingerprint === undefined) {
      return;
   }

   if (!needsDependencyInstall(dir, previousDir)) {
      await fs.rename(previousModulesDir, modulesDir);
      return;
   }

   await npm.installDependencies(dir);
   await fs.mkdir(modulesDir, { recursive: true });
   await fs.writeFile(join(modulesDir, INSTALL_FINGERPRINT_FILE), fingerprint, 'utf-8');
}

function readInstallFingerprint(modulesDir: string): string | undefined {
   const { fs } = getRuntimeAdapter(),
         fingerprintPath = join(modulesDir, INSTALL_FINGERPRINT_FILE);

   return fs.existsSync(fingerprintPath) ? fs.readFileSync(fingerprintPath, 'utf-8') : undefined;
}

async function resolveNpmExtends(
   packageName: string,
   context: ExtendsContext,
   visited: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
   const chain = enterExtends(visited, packageName),
         { fs, npm } = getRuntimeAdapter();

   let packagePath: string;

   try {
      packagePath = await npm.resolvePackagePath(packageName, context.projectRoot, 'ai.json');
   } catch (error) {
      if (error instanceof UnsupportedRuntimeCapabilityError) {
         throw error;
      }
      throw new ConfigParseError(
         `Failed to resolve npm package: ${packageName}. Make sure it's installed.`,
         packageName,
      );
   }

   const baseDir = dirname(packagePath),
         parsed = parseExtendedConfig(fs.readFileSync(packagePath, 'utf-8'), packagePath),
         resolved = await resolveExtendsChain(parsed, { baseDir, context, visited: chain, isRemote: false });

   // Normalize local paths to absolute so they remain valid after merging into the parent config
   return normalizeLocalPaths(resolved, baseDir);
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

   for (const section of SOURCE_REF_SECTIONS) {
      const sources = result[section];

      if (isRecord(sources)) {
         result[section] = Object.fromEntries(Object.entries(sources).map(([name, ref]) => {
            return [name, rebaseSourceRef(ref, baseDir)];
         }));
      }
   }

   // Invalid hooks are left as they are: validating the merged config reports them with the
   // full path and the received value, which an error thrown from here could not.
   const hooks = hooksSchema.safeParse(result.hooks);

   if (hooks.success) {
      result.hooks = Object.fromEntries(Object.entries(hooks.data).map(([event, matchers]) => {
         return [event, matchers?.map((matcher) => {
            return { ...matcher, hooks: matcher.hooks.map((action) => normalizeHookAction(action, baseDir)) };
         })];
      }));
   }

   return result;
}

function normalizeHookAction(action: HookAction, baseDir: string): HookAction {
   const normalized = { ...action };

   for (const field of ['command', 'bash', 'powershell'] as const) {
      const command = action[field];

      if (command) {
         normalized[field] = normalizeHookCommand(command, baseDir, field === 'powershell' || action.shell === 'powershell');
      }
   }

   return normalized;
}

function normalizeHookCommand(command: string, baseDir: string, powershell: boolean): string {
   // ponytail: only simple shell words are rewritten; compound commands need a shell parser.
   const words = /"[^"$`\\]*"|'[^']*'|[^\s"'$`\\|;&<>]+/g;

   if (command.replace(words, '').trim()) {
      return command;
   }

   return command.replace(words, (word) => {
      const path = word.startsWith('"') || word.startsWith("'") ? word.slice(1, -1) : word,
            absolutePath = resolve(baseDir, path);

      if (!isLocalPath(path) || !getRuntimeAdapter().fs.existsSync(absolutePath)) {
         return word;
      }

      const escapedPath = powershell ? absolutePath.replaceAll("'", "''") : absolutePath.replaceAll("'", "'\\''");

      return `'${escapedPath}'`;
   });
}

/**
 * Rebase the local path of one skill, rule, prompt or agent reference onto `baseDir`, so the
 * reference still resolves after it is merged into a config in another directory.
 */
function rebaseSourceRef(ref: unknown, baseDir: string): unknown {
   if (typeof ref === 'string') {
      if (!isLocalPath(ref)) {
         return ref;
      }

      return resolve(baseDir, ref.startsWith(FILE_PROTOCOL) ? ref.slice(FILE_PROTOCOL.length) : ref);
   }

   if (!isRecord(ref)) {
      return ref;
   }

   // A `path` beside `git` or `npm` is a location inside that repository or package.
   if (typeof ref.path === 'string' && !('git' in ref) && !('npm' in ref)) {
      return { ...ref, path: resolve(baseDir, ref.path) };
   }

   // Skills may wrap their reference: { source: "./skills/foo" } or { source: { path: "..." } }
   if ('source' in ref) {
      return { ...ref, source: rebaseSourceRef(ref.source, baseDir) };
   }

   return ref;
}
