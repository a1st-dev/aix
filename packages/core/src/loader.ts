import { dirname } from 'pathe';
import { parseConfig, parseLocalConfig, type AiJsonConfig } from '@a1st/aix-schema';
import type { ZodError } from 'zod';
import { discoverConfig, parseConfigContent } from './discovery.js';
import { resolveExtends } from './inheritance.js';
import { ConfigNotFoundError, ConfigParseError } from './errors.js';
import { extractValidationIssues, toConfigValidationError } from './format-error.js';
import { loadFromSource } from './remote-loader.js';
import { mergeConfigs } from './merge.js';

export interface LoadedConfig {
   path: string;
   config: AiJsonConfig;
   source: 'file' | 'package.json' | 'remote';
   /** Warning messages generated during config loading */
   warnings?: string[];
   /** Path to ai.local.json if it was merged */
   localPath?: string;
   /** Whether local overrides were applied */
   hasLocalOverrides?: boolean;
   /**
    * Base directory/URL for resolving relative paths in the config (skills, rules, etc.). For local
    * configs, this is the directory containing the config file. For remote URL configs, this is the
    * remote URL directory. For git shorthand configs, this is the local temp directory where the
    * repo was downloaded.
    */
   configBaseDir?: string;
}

export interface LoadConfigOptions {
   /** Explicit path to local config file (existing behavior) */
   explicitPath?: string;
   /** Remote URL, git shorthand, or local path to load config from */
   remoteSource?: string;
   /** Starting directory for discovery and relative path resolution */
   startDir?: string;
}

/**
 * Load config from various sources: remote URL, git shorthand, local path, or discovery.
 * @param options - Load options (new API)
 * @param explicitPath - Deprecated: use options.explicitPath instead
 * @param startDir - Deprecated: use options.startDir instead
 */
export async function loadConfig(
   options?: LoadConfigOptions | string,
   startDir?: string,
): Promise<LoadedConfig | undefined> {
   // Handle legacy API: loadConfig(explicitPath?, startDir?)
   let opts: LoadConfigOptions;

   if (typeof options === 'string' || options === undefined) {
      opts = {
         explicitPath: options,
         startDir: startDir ?? process.cwd(),
      };
   } else {
      opts = { startDir: process.cwd(), ...options };
   }

   const { explicitPath, remoteSource, startDir: cwd = process.cwd() } = opts;

   // If remoteSource is provided, load from URL/git/path
   if (remoteSource) {
      return loadFromRemoteSource(remoteSource, cwd);
   }

   // Existing discovery behavior
   const discovered = await discoverConfig(cwd, explicitPath);

   if (!discovered) {
      return undefined;
   }

   return loadFromDiscovered(discovered);
}

/**
 * Load config from a remote source (URL, git shorthand, or local path).
 */
async function loadFromRemoteSource(source: string, cwd: string): Promise<LoadedConfig> {
   const remote = await loadFromSource(source, cwd),
         resolved = await resolveExtends(remote.content, {
            baseDir: remote.baseUrl,
            isRemote: remote.isRemote,
         });

   let validated: AiJsonConfig;

   try {
      validated = parseConfig(resolved);
   } catch (error) {
      const validationError = toConfigValidationError(error);

      if (validationError) {
         throw validationError;
      }
      throw new ConfigParseError(error instanceof Error ? error.message : String(error), source);
   }

   // Map source type to LoadedConfig source
   const sourceType: 'file' | 'remote' = remote.source === 'local' ? 'file' : 'remote';

   return {
      path: source,
      config: validated,
      source: sourceType,
      configBaseDir: remote.baseUrl,
   };
}

/**
 * Merge local config overrides into a base config.
 * @returns The merged config and whether local overrides were applied
 */
function mergeLocalOverrides(
   baseConfig: AiJsonConfig,
   localContent: string,
   localPath: string,
): { config: AiJsonConfig; hasLocalOverrides: true } {
   const localParsed = parseConfigContent(localContent) as Record<string, unknown>;

   try {
      const localValidated = parseLocalConfig(localParsed);

      return {
         config: mergeConfigs(baseConfig, localValidated),
         hasLocalOverrides: true,
      };
   } catch (error) {
      if (error instanceof Error && 'issues' in error) {
         const zodError = error as ZodError,
               issues = extractValidationIssues(zodError, localParsed);

         throw new ConfigParseError('Validation failed', localPath, issues);
      }
      if (error instanceof Error) {
         throw new ConfigParseError(error.message, localPath);
      }
      throw error;
   }
}

/**
 * Load config from a discovered local config.
 */
async function loadFromDiscovered(discovered: {
   path: string;
   content: string;
   source: 'file' | 'package.json';
   packageJsonAlsoHasAi?: boolean;
   localPath?: string;
   localContent?: string;
}): Promise<LoadedConfig> {
   try {
      const parsed = parseConfigContent(discovered.content) as Record<string, unknown>,
            baseDir = dirname(discovered.path),
            resolved = await resolveExtends(parsed, { baseDir });

      let validated = parseConfig(resolved);

      const warnings: string[] = [];

      if (discovered.packageJsonAlsoHasAi) {
         warnings.push(
            'Both ai.json and package.json "ai" field exist. Using ai.json (package.json "ai" field is ignored).',
         );
      }

      // Merge local overrides if present
      let localPath: string | undefined;
      let hasLocalOverrides = false;

      if (discovered.localContent) {
         const localFilePath = discovered.localPath ?? 'ai.local.json',
               merged = mergeLocalOverrides(validated, discovered.localContent, localFilePath);

         validated = merged.config;
         localPath = discovered.localPath;
         hasLocalOverrides = merged.hasLocalOverrides;
      }

      return {
         path: discovered.path,
         config: validated,
         source: discovered.source,
         configBaseDir: baseDir,
         ...(warnings.length > 0 && { warnings }),
         ...(localPath && { localPath }),
         ...(hasLocalOverrides && { hasLocalOverrides }),
      };
   } catch (error) {
      const validationError = toConfigValidationError(error);

      if (validationError) {
         throw validationError;
      }
      if (error instanceof ConfigParseError) {
         throw error;
      }
      if (error instanceof Error) {
         throw new ConfigParseError(error.message, discovered.path);
      }
      throw error;
   }
}

/**
 * Load config or throw if not found.
 * @param options - Load options (new API)
 * @param explicitPath - Deprecated: use options.explicitPath instead
 * @param startDir - Deprecated: use options.startDir instead
 */
export async function requireConfig(
   options?: LoadConfigOptions | string,
   startDir?: string,
): Promise<LoadedConfig> {
   const result = await loadConfig(options, startDir);

   if (!result) {
      const searchPath =
         typeof options === 'string' ? options : (options?.explicitPath ?? options?.remoteSource);

      throw new ConfigNotFoundError(searchPath);
   }

   return result;
}
