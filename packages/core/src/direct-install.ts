import { basename, dirname, join, resolve } from 'pathe';
import {
   createEmptyConfig,
   hooksSchema,
   parseConfig,
   parseJsonc,
   type AiJsonConfig,
   type HookMatcher,
   type HooksConfig,
   type GitSource,
   type McpServerConfig,
   type PromptValue,
   type RuleValue,
} from '@a1st/aix-schema';
import { loadPrompt } from './prompts/loader.js';
import { loadRule } from './rules/loader.js';
import { isGitReference, parseSourceReference } from './reference-resolver.js';
import { fetchWithTimeout } from './remote-loader.js';
import { getHooksCacheDir, getMcpCacheDir } from './cache/paths.js';
import { loadFromGit } from './git-loader.js';
import { resolveNpmPath } from './npm/resolve.js';
import {
   inferNameFromPath,
   isLocalPath,
   parseGitHubBlobUrl,
   parseGitHubRepoUrl,
   parseGitHubTreeUrl,
} from './url-parsing.js';
import { getRuntimeAdapter } from './runtime/index.js';

export type DirectInstallType = 'mcp' | 'skill' | 'rule' | 'hook' | 'prompt';

export interface DirectMcpOptions {
   readonly serverConfig?: McpServerConfig;
   readonly command?: string;
   readonly args?: readonly string[];
   readonly env?: Readonly<Record<string, string>>;
   readonly url?: string;
   readonly headers?: Readonly<Record<string, string>>;
}

export interface DirectRuleOptions {
   readonly description?: string;
   readonly activation?: 'always' | 'auto' | 'glob' | 'manual';
   readonly globs?: readonly string[];
}

export interface DirectPromptOptions {
   readonly description?: string;
   readonly argumentHint?: string;
}

export interface ResolveDirectInstallOptions {
   readonly type: DirectInstallType;
   readonly source?: string;
   readonly name?: string;
   readonly ref?: string;
   readonly cwd: string;
   readonly mcp?: DirectMcpOptions;
   readonly rule?: DirectRuleOptions;
   readonly prompt?: DirectPromptOptions;
}

export interface DirectInstallConfig {
   readonly config: AiJsonConfig;
   readonly sections: readonly ('rules' | 'mcp' | 'skills' | 'agents' | 'hooks' | 'prompts')[];
   readonly name: string;
}

interface DirectHookFragment {
   event?: string;
   matcher?: string;
   sequential?: boolean;
   description?: string;
   hooks?: unknown;
}

function getBasePath(cwd: string): string {
   return join(cwd, 'ai.json');
}

function assertName(name: string | undefined, type: DirectInstallType): string {
   if (!name) {
      throw new Error(`Could not infer ${type} name. Please provide --name.`);
   }
   if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      throw new Error(
         `Invalid ${type} name "${name}". Use lowercase alphanumeric names with single hyphens.`,
      );
   }
   return name;
}

function normalizeName(value: string | undefined): string | undefined {
   if (!value) {
      return undefined;
   }
   const normalized = value
      .replace(/^@[^/]+\//, '')
      .replace(/^aix-(skill|rule|prompt|hook)-/, '')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

   return normalized || undefined;
}

function isHttpsSource(source: string): boolean {
   return source.startsWith('https://');
}

function isGitWebSource(source: string): boolean {
   return Boolean(parseGitHubBlobUrl(source) ?? parseGitHubRepoUrl(source) ?? parseGitHubTreeUrl(source));
}

function getPackageNameFromNpmSource(source: string): string {
   return source.startsWith('npm:') ? source.slice('npm:'.length) : source;
}

function getPackageBasename(packageName: string): string | undefined {
   return normalizeName(packageName.split('/').pop());
}

function createPackageValue(
   source: string,
   type: 'rule' | 'prompt',
   name: string,
   version: string | undefined,
): RuleValue | PromptValue {
   const packageName = getPackageNameFromNpmSource(source),
         folder = type === 'rule' ? 'rules' : 'prompts';

   return {
      npm: {
         npm: packageName,
         path: `${folder}/${name}.md`,
         ...(version ? { version } : {}),
      },
   };
}

async function readTextSource(source: string, cwd: string): Promise<string> {
   if (isHttpsSource(source)) {
      return fetchWithTimeout(source);
   }

   const path = isLocalPath(source) ? source.replace(/^file:/, '') : source,
         fullPath = resolve(cwd, path);

   return getRuntimeAdapter().fs.readFile(fullPath, 'utf-8');
}

function getParsedJson(source: string, content: string): unknown {
   const parsed = parseJsonc(content);

   if (parsed.errors.length > 0) {
      throw new Error(`Failed to parse ${source}: ${parsed.errors[0]?.message}`);
   }
   return parsed.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getGitSource(value: unknown, fallbackUrl: string): GitSource {
   if (typeof value === 'string') {
      return { url: value };
   }
   if (isRecord(value) && isRecord(value.git)) {
      const url = typeof value.git.url === 'string' ? value.git.url : undefined;

      if (!url) {
         throw new Error(`Invalid git source: ${fallbackUrl}`);
      }
      return {
         url,
         ...(typeof value.git.ref === 'string' ? { ref: value.git.ref } : {}),
         ...(typeof value.git.path === 'string' ? { path: value.git.path } : {}),
      };
   }
   throw new Error(`Invalid git source: ${fallbackUrl}`);
}

function isMcpServerConfig(value: unknown): value is McpServerConfig {
   return isRecord(value) && (typeof value.command === 'string' || typeof value.url === 'string');
}

function createConfigForSection(
   section: DirectInstallConfig['sections'][number],
   name: string,
   value: unknown,
): DirectInstallConfig {
   const config = createEmptyConfig();

   switch (section) {
      case 'mcp':
         if (!isMcpServerConfig(value)) {
            throw new Error(`Invalid MCP server config for "${name}"`);
         }
         config.mcp = { [name]: value };
         break;
      case 'skills':
         config.skills = { [name]: value as AiJsonConfig['skills'][string] };
         break;
      case 'rules':
         config.rules = { [name]: value as RuleValue };
         break;
      case 'prompts':
         config.prompts = { [name]: value as PromptValue };
         break;
      case 'hooks':
         config.hooks = value as HooksConfig;
         break;
      case 'agents':
         throw new Error('Direct agent install is not supported');
   }

   return {
      config: parseConfig(config),
      sections: [section],
      name,
   };
}

function normalizeSkillSource(source: string, name: string | undefined, ref: string | undefined): unknown {
   if (source.startsWith('npm:')) {
      return getPackageNameFromNpmSource(source);
   }
   if (isLocalPath(source)) {
      const path = source.replace(/^file:/, ''),
            normalizedPath = basename(path).toLowerCase() === 'skill.md' ? dirname(path) : path;

      return { path: normalizedPath };
   }

   const parsed = parseSourceReference(source, { type: 'skill', refOverride: ref });

   if (isRecord(parsed.value) && 'git' in parsed.value && isRecord(parsed.value.git)) {
      const git = parsed.value.git,
            gitUrl = typeof git.url === 'string' ? git.url : undefined;

      if (!gitUrl) {
         throw new Error(`Invalid skill git source: ${source}`);
      }
      return {
         git: gitUrl,
         ...(typeof git.ref === 'string' ? { ref: git.ref } : {}),
         ...(typeof git.path === 'string' ? { path: git.path } : {}),
      };
   }

   if (typeof parsed.value === 'string') {
      return parsed.value;
   }

   if (name) {
      return source;
   }

   throw new Error(`Could not resolve skill source: ${source}`);
}

function inferSkillName(source: string): string | undefined {
   if (source.startsWith('npm:')) {
      return getPackageBasename(getPackageNameFromNpmSource(source));
   }
   if (isLocalPath(source)) {
      const path = source.replace(/^file:/, ''),
            parent = basename(path).toLowerCase() === 'skill.md' ? dirname(path) : path;

      return normalizeName(inferNameFromPath(parent, ['.md']));
   }

   const parsed = parseSourceReference(source, { type: 'skill' });

   return normalizeName(parsed.inferredName);
}

async function resolveDirectSkill(options: ResolveDirectInstallOptions): Promise<DirectInstallConfig> {
   const source = options.source;

   if (!source) {
      throw new Error('Direct skill install requires a source.');
   }

   const name = assertName(options.name ?? inferSkillName(source), 'skill'),
         value = normalizeSkillSource(source, name, options.ref);

   return createConfigForSection('skills', name, value);
}

async function resolveDirectRule(options: ResolveDirectInstallOptions): Promise<DirectInstallConfig> {
   const source = options.source;

   if (!source) {
      throw new Error('Direct rule install requires a source.');
   }

   let value: RuleValue;
   let inferredName: string | undefined;

   if (source.startsWith('npm:')) {
      inferredName = getPackageBasename(getPackageNameFromNpmSource(source));
      const name = assertName(options.name ?? inferredName, 'rule');

      value = createPackageValue(source, 'rule', name, options.ref) as RuleValue;
   } else if (isHttpsSource(source) && !isGitWebSource(source)) {
      inferredName = normalizeName(inferNameFromPath(source, ['.md', '.txt']));
      value = { content: await fetchWithTimeout(source) };
   } else {
      const parsed = parseSourceReference(source, { type: 'rule', refOverride: options.ref });

      inferredName = normalizeName(parsed.inferredName);
      value = parsed.value as RuleValue;
   }

   const name = assertName(options.name ?? inferredName, 'rule');

   if (typeof value === 'string') {
      value = { path: value };
   }
   value = {
      ...value,
      ...(options.rule?.description ? { description: options.rule.description } : {}),
      ...(options.rule?.activation && options.rule.activation !== 'always'
         ? { activation: options.rule.activation }
         : {}),
      ...(options.rule?.globs && options.rule.globs.length > 0 ? { globs: [...options.rule.globs] } : {}),
   };

   await loadRule(name, value, getBasePath(options.cwd));

   return createConfigForSection('rules', name, value);
}

async function resolveDirectPrompt(options: ResolveDirectInstallOptions): Promise<DirectInstallConfig> {
   const source = options.source;

   if (!source) {
      throw new Error('Direct prompt install requires a source.');
   }

   let value: PromptValue;
   let inferredName: string | undefined;

   if (source.startsWith('npm:')) {
      inferredName = getPackageBasename(getPackageNameFromNpmSource(source));
      const name = assertName(options.name ?? inferredName, 'prompt');

      value = createPackageValue(source, 'prompt', name, options.ref) as PromptValue;
   } else if (isHttpsSource(source) && !isGitWebSource(source)) {
      inferredName = normalizeName(inferNameFromPath(source, ['.md', '.prompt.md', '.txt']));
      value = { content: await fetchWithTimeout(source) };
   } else {
      const parsed = parseSourceReference(source, { type: 'prompt', refOverride: options.ref });

      inferredName = normalizeName(parsed.inferredName);
      value = parsed.value as PromptValue;
   }

   const name = assertName(options.name ?? inferredName, 'prompt');

   if (typeof value === 'string') {
      value = { path: value };
   }
   value = {
      ...value,
      ...(options.prompt?.description ? { description: options.prompt.description } : {}),
      ...(options.prompt?.argumentHint ? { argumentHint: options.prompt.argumentHint } : {}),
   };

   await loadPrompt(name, value, getBasePath(options.cwd));

   return createConfigForSection('prompts', name, value);
}

function normalizeHookFragment(value: unknown): HooksConfig {
   if (isRecord(value) && isRecord(value.hooks)) {
      return hooksSchema.parse(value.hooks);
   }

   if (!isRecord(value)) {
      throw new Error('Hook source must be a JSON object.');
   }

   const fragment = value as DirectHookFragment;

   if (typeof fragment.event !== 'string') {
      throw new Error('Hook fragment must include an event field.');
   }
   if (!Array.isArray(fragment.hooks)) {
      throw new Error('Hook fragment must include a hooks array.');
   }

   const matcher: HookMatcher = {
      ...(typeof fragment.matcher === 'string' ? { matcher: fragment.matcher } : {}),
      ...(typeof fragment.sequential === 'boolean' ? { sequential: fragment.sequential } : {}),
      ...(typeof fragment.description === 'string' ? { description: fragment.description } : {}),
      hooks: fragment.hooks,
   };

   return hooksSchema.parse({ [fragment.event]: [matcher] });
}

function inferHookName(source: string): string | undefined {
   if (source.startsWith('npm:')) {
      return getPackageBasename(getPackageNameFromNpmSource(source));
   }
   if (isGitReference(source)) {
      const parsed = parseSourceReference(source, {
         type: 'prompt',
         extensions: ['.json', '.jsonc'],
      });

      return normalizeName(parsed.inferredName);
   }
   return normalizeName(inferNameFromPath(source, ['.json', '.jsonc']));
}

async function readHookSource(source: string, name: string, options: ResolveDirectInstallOptions): Promise<string> {
   if (source.startsWith('npm:')) {
      const filePath = await resolveNpmPath({
         packageName: getPackageNameFromNpmSource(source),
         subpath: `hooks/${name}.jsonc`,
         version: options.ref,
         projectRoot: options.cwd,
      });

      return getRuntimeAdapter().fs.readFile(filePath, 'utf-8');
   }
   if (isGitReference(source)) {
      const parsed = parseSourceReference(source, {
               type: 'prompt',
               extensions: ['.json', '.jsonc'],
               refOverride: options.ref,
            }),
            result = await loadFromGit({
               git: getGitSource(parsed.value, source),
               cacheDir: getHooksCacheDir(options.cwd),
               defaultFilePath: `hooks/${name}.jsonc`,
            });

      return result.content;
   }
   return readTextSource(source, options.cwd);
}

async function resolveDirectHook(options: ResolveDirectInstallOptions): Promise<DirectInstallConfig> {
   const source = options.source;

   if (!source) {
      throw new Error('Direct hook install requires a source.');
   }

   const name = assertName(options.name ?? inferHookName(source), 'hook'),
         content = await readHookSource(source, name, options),
         parsed = getParsedJson(source, content),
         hooks = normalizeHookFragment(parsed);

   return createConfigForSection('hooks', name, hooks);
}

function getMcpName(options: ResolveDirectInstallOptions, source: string | undefined): string {
   if (options.name) {
      return assertName(options.name, 'mcp');
   }
   if (source) {
      return assertName(normalizeName(inferNameFromPath(source, ['.json', '.jsonc'])), 'mcp');
   }
   return assertName(undefined, 'mcp');
}

function parseMcpJson(name: string, parsed: unknown): McpServerConfig {
   if (isMcpServerConfig(parsed)) {
      return parsed;
   }
   if (isRecord(parsed) && isRecord(parsed.mcp)) {
      const entries = Object.entries(parsed.mcp).filter(([, value]) => value !== false);

      if (entries.length === 1) {
         const [, value] = entries[0]!;

         if (isMcpServerConfig(value)) {
            return value;
         }
      }
      if (name in parsed.mcp && isMcpServerConfig(parsed.mcp[name])) {
         return parsed.mcp[name];
      }
      throw new Error('MCP config contains multiple servers. Provide --name to select one.');
   }
   if (isRecord(parsed) && isRecord(parsed.mcpServers)) {
      if (name in parsed.mcpServers && isMcpServerConfig(parsed.mcpServers[name])) {
         return parsed.mcpServers[name];
      }
      throw new Error('MCP config contains multiple servers. Provide --name to select one.');
   }
   throw new Error('MCP source must contain a server config, mcp object, or mcpServers object.');
}

async function readMcpGitSource(source: string, name: string, ref: string | undefined, cwd: string): Promise<McpServerConfig> {
   const parsed = parseSourceReference(source, {
            type: 'prompt',
            extensions: ['.json', '.jsonc'],
            refOverride: ref,
         }),
         result = await loadFromGit({
            git: getGitSource(parsed.value, source),
            cacheDir: getMcpCacheDir(cwd),
            defaultFilePath: `mcp/${name}.jsonc`,
         }),
         config = getParsedJson(source, result.content);

   return parseMcpJson(name, config);
}

async function resolveDirectMcp(options: ResolveDirectInstallOptions): Promise<DirectInstallConfig> {
   const source = options.source,
         name = getMcpName(options, source);

   if (options.mcp?.serverConfig) {
      return createConfigForSection('mcp', name, options.mcp.serverConfig);
   }

   if (options.mcp?.command) {
      return createConfigForSection('mcp', name, {
         command: options.mcp.command,
         ...(options.mcp.args && options.mcp.args.length > 0 ? { args: [...options.mcp.args] } : {}),
         ...(options.mcp.env && Object.keys(options.mcp.env).length > 0 ? { env: { ...options.mcp.env } } : {}),
      });
   }

   if (options.mcp?.url || (source && isHttpsSource(source) && !isGitWebSource(source))) {
      return createConfigForSection('mcp', name, {
         url: options.mcp?.url ?? source!,
         ...(options.mcp?.headers && Object.keys(options.mcp.headers).length > 0
            ? { headers: { ...options.mcp.headers } }
            : {}),
      });
   }

   if (!source) {
      throw new Error('Direct MCP install requires a source, --url, or --command.');
   }

   if (isLocalPath(source)) {
      const path = source.replace(/^file:/, '');

      if (/\.(json|jsonc)$/i.test(path)) {
         const content = await readTextSource(path, options.cwd),
               parsed = getParsedJson(source, content);

         return createConfigForSection('mcp', name, parseMcpJson(name, parsed));
      }
      return createConfigForSection('mcp', name, { command: path });
   }

   if (isGitReference(source)) {
      return createConfigForSection('mcp', name, await readMcpGitSource(source, name, options.ref, options.cwd));
   }

   const packageName = getPackageNameFromNpmSource(source);

   return createConfigForSection('mcp', name, { command: `npx ${packageName}` });
}

export async function resolveDirectInstallConfig(
   options: ResolveDirectInstallOptions,
): Promise<DirectInstallConfig> {
   switch (options.type) {
      case 'skill':
         return resolveDirectSkill(options);
      case 'rule':
         return resolveDirectRule(options);
      case 'prompt':
         return resolveDirectPrompt(options);
      case 'hook':
         return resolveDirectHook(options);
      case 'mcp':
         return resolveDirectMcp(options);
   }
}

function redactValue(value: unknown): unknown {
   if (Array.isArray(value)) {
      return value.map(redactValue);
   }
   if (!isRecord(value)) {
      return value;
   }

   const redacted: Record<string, unknown> = {};

   for (const [key, entry] of Object.entries(value)) {
      if ((key === 'env' || key === 'headers') && isRecord(entry)) {
         redacted[key] = Object.fromEntries(
            Object.keys(entry).map((entryKey) => [entryKey, '<redacted>']),
         );
      } else {
         redacted[key] = redactValue(entry);
      }
   }

   return redacted;
}

export function redactDirectInstallConfig(config: AiJsonConfig): AiJsonConfig {
   return parseConfig(redactValue(config));
}
