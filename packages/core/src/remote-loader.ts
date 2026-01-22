/**
 * Remote config loading utilities for fetching ai.json from URLs, git repos, and local paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'pathe';
import { downloadTemplate } from 'giget';
import { parseJsonc, detectSourceType } from '@a1st/aix-schema';
import {
   convertBlobToRawUrl,
   parseGitShorthand,
   parseGitHubRepoUrl,
   parseGitHubBlobUrl,
} from './url-parsing.js';
import {
   ConfigNotFoundError,
   ConfigParseError,
   RemoteFetchError,
   UnsupportedUrlError,
} from './errors.js';

export type RemoteSourceType = 'url' | 'git' | 'local';

/** Git source metadata for creating git references when saving configs */
export interface GitSourceInfo {
   /** Git provider */
   provider: 'github' | 'gitlab' | 'bitbucket';
   /** Repository owner/user */
   owner: string;
   /** Repository name */
   repo: string;
   /** Git ref (branch, tag, commit) */
   ref?: string;
   /** Path to the config file within the repo (e.g., "ai.json" or "configs/ai.json") */
   configPath?: string;
}

export interface RemoteLoadResult {
   /** Parsed config content */
   content: Record<string, unknown>;
   /** Base path/URL for resolving relative extends */
   baseUrl: string;
   /** Source type */
   source: RemoteSourceType;
   /** Whether the base is a remote URL (for extends resolution) */
   isRemote: boolean;
   /** Git source metadata (present when source is 'git') */
   gitSource?: GitSourceInfo;
}

const FETCH_TIMEOUT_MS = 30000;

/**
 * Fetch content from a URL with timeout.
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
   const controller = new AbortController(),
         timeout = setTimeout(() => controller.abort(), timeoutMs);

   try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
   } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
         throw new Error(`Request timed out after ${timeoutMs}ms`, { cause: error });
      }
      throw error;
   } finally {
      clearTimeout(timeout);
   }
}

/**
 * Load config from a GitHub blob URL by downloading the repo. This ensures relative paths (skills,
 * rules, etc.) can be resolved from the downloaded repo.
 */
async function loadFromGitHubBlobUrl(parsed: {
   owner: string;
   repo: string;
   ref: string;
   path: string;
}): Promise<RemoteLoadResult> {
   // Download the repo using giget to a temp directory
   const template = `github:${parsed.owner}/${parsed.repo}#${parsed.ref}`;

   let dir: string;

   try {
      const result = await downloadTemplate(template, { force: true, cwd: tmpdir() });

      dir = result.dir;
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(
         `https://github.com/${parsed.owner}/${parsed.repo}/blob/${parsed.ref}/${parsed.path}`,
         message,
      );
   }

   // Read the config file from the downloaded repo
   const configPath = resolve(dir, parsed.path);

   if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(configPath);
   }

   const content = readFileSync(configPath, 'utf-8'),
         result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, configPath);
   }

   return {
      content: result.data as Record<string, unknown>,
      baseUrl: dirname(configPath),
      source: 'git',
      isRemote: false, // Local filesystem after download
      gitSource: {
         provider: 'github',
         owner: parsed.owner,
         repo: parsed.repo,
         ref: parsed.ref,
         configPath: parsed.path,
      },
   };
}

/**
 * Load config from a remote URL (direct or blob URL). For blob URLs from GitHub/GitLab/Bitbucket,
 * downloads the entire repo so relative paths can be resolved.
 */
export async function loadFromUrl(url: string): Promise<RemoteLoadResult> {
   // For GitHub blob URLs, download the repo so relative paths work
   const ghBlob = parseGitHubBlobUrl(url);

   if (ghBlob) {
      return loadFromGitHubBlobUrl(ghBlob);
   }

   // For other URLs, fetch the raw content directly
   const rawUrl = convertBlobToRawUrl(url);

   let content: string;

   try {
      content = await fetchWithTimeout(rawUrl);
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(url, message);
   }

   const result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, url);
   }

   // Compute base URL for relative extends (directory containing the file)
   const baseUrl = rawUrl.substring(0, rawUrl.lastIndexOf('/') + 1);

   return {
      content: result.data as Record<string, unknown>,
      baseUrl,
      source: 'url',
      isRemote: true,
   };
}

/**
 * Load config from git shorthand (github:org/repo, github:org/repo/path#ref, etc.).
 * If no path is specified, looks for ai.json at repo root.
 */
export async function loadFromGitShorthand(input: string): Promise<RemoteLoadResult> {
   const parsed = parseGitShorthand(input);

   if (!parsed) {
      throw new ConfigParseError(`Invalid git shorthand: ${input}`, input);
   }

   // Build the giget template string
   let template = `${parsed.provider}:${parsed.user}/${parsed.repo}`;

   if (parsed.subpath) {
      template += `/${parsed.subpath}`;
   }
   if (parsed.ref) {
      template += `#${parsed.ref}`;
   }

   let dir: string;

   try {
      const result = await downloadTemplate(template, { force: true, cwd: tmpdir() });

      dir = result.dir;
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(input, message);
   }

   // Look for ai.json - if subpath ends with .json, use it directly; otherwise look for ai.json in dir
   let configPath: string;
   let configPathInRepo: string;

   if (parsed.subpath?.endsWith('.json')) {
      // The subpath itself is the config file
      configPath = resolve(dir, parsed.subpath.split('/').pop()!);
      configPathInRepo = parsed.subpath;
   } else {
      configPath = resolve(dir, 'ai.json');
      configPathInRepo = parsed.subpath ? `${parsed.subpath}/ai.json` : 'ai.json';
   }

   if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(configPath);
   }

   const content = readFileSync(configPath, 'utf-8'),
         result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, configPath);
   }

   return {
      content: result.data as Record<string, unknown>,
      baseUrl: dirname(configPath),
      source: 'git',
      isRemote: false, // Local filesystem after download
      gitSource: {
         provider: parsed.provider,
         owner: parsed.user,
         repo: parsed.repo,
         ref: parsed.ref,
         configPath: configPathInRepo,
      },
   };
}

/**
 * Load config from a local file path.
 */
export function loadFromLocalPath(path: string, cwd: string = process.cwd()): RemoteLoadResult {
   const absolutePath = resolve(cwd, path);

   if (!existsSync(absolutePath)) {
      throw new ConfigNotFoundError(absolutePath);
   }

   const content = readFileSync(absolutePath, 'utf-8'),
         result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, absolutePath);
   }

   return {
      content: result.data as Record<string, unknown>,
      baseUrl: dirname(absolutePath),
      source: 'local',
      isRemote: false,
   };
}


/**
 * Load config from a GitHub/GitLab/Bitbucket repo URL (not a blob URL).
 * Downloads the repo and looks for ai.json at the root.
 */
async function loadFromRepoUrl(url: string): Promise<RemoteLoadResult> {
   // Try to parse as GitHub repo URL
   const ghRepo = parseGitHubRepoUrl(url);

   if (ghRepo) {
      return loadFromGitShorthand(`github:${ghRepo.owner}/${ghRepo.repo}`);
   }

   // For other repo URLs, try using giget directly
   let dir: string;

   try {
      const result = await downloadTemplate(url, { force: true, cwd: tmpdir() });

      dir = result.dir;
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new RemoteFetchError(url, message);
   }

   const configPath = resolve(dir, 'ai.json');

   if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(configPath);
   }

   const content = readFileSync(configPath, 'utf-8'),
         result = parseJsonc(content);

   if (result.errors.length > 0) {
      throw new ConfigParseError(`Parse error: ${result.errors[0]?.message}`, configPath);
   }

   return {
      content: result.data as Record<string, unknown>,
      baseUrl: dirname(configPath),
      source: 'git',
      isRemote: false,
   };
}

/**
 * Classify and load config from any source type.
 */
export async function loadFromSource(
   source: string,
   cwd: string = process.cwd(),
): Promise<RemoteLoadResult> {
   const sourceType = detectSourceType(source);

   switch (sourceType) {
   case 'git-shorthand':
      return loadFromGitShorthand(source);

   case 'https-file':
      return loadFromUrl(source);

   case 'https-repo':
      return loadFromRepoUrl(source);

   case 'http-unsupported':
      throw new UnsupportedUrlError(source);

   case 'local':
      return loadFromLocalPath(source, cwd);

   case 'npm':
      // npm packages are not supported as config sources (only for skills/rules)
      throw new UnsupportedUrlError(source);
   }
}
