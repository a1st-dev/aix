/**
 * Shared git loading utilities for fetching content from git repositories.
 * Used by prompts/loader.ts and rules/loader.ts.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'pathe';
import { downloadTemplate } from 'giget';
import type { GitSource } from '@a1st/aix-schema';
import { parseGitHubBlobUrl } from './url-parsing.js';

export interface GitLoadOptions {
   /** Git source configuration */
   git: GitSource;
   /** Directory for caching downloaded repos */
   cacheDir: string;
   /** Default file path if not specified in git source (e.g., 'prompt.md', 'RULES.md') */
   defaultFilePath: string;
}

export interface GitLoadResult {
   /** File content */
   content: string;
   /** Source path for attribution (e.g., 'https://github.com/user/repo#main:path/file.md') */
   sourcePath: string;
}

/**
 * Load content from a git repository using giget.
 * Handles GitHub blob URLs, caching, and provider URL normalization.
 */
export async function loadFromGit(options: GitLoadOptions): Promise<GitLoadResult> {
   const { git, cacheDir, defaultFilePath } = options;
   let { url, path: filePath, ref } = git;

   // Handle GitHub blob URLs (direct file links)
   const blobParsed = parseGitHubBlobUrl(url);

   if (blobParsed) {
      url = `https://github.com/${blobParsed.owner}/${blobParsed.repo}`;
      ref = ref ?? blobParsed.ref;
      filePath = filePath ?? blobParsed.path;
   }

   // Default values
   filePath = filePath ?? defaultFilePath;
   ref = ref ?? 'main';

   // Create cache key from URL + ref + path
   const cacheKey = Buffer.from(`${url}:${ref}:${filePath}`).toString('base64url').slice(0, 32),
         cachePath = join(cacheDir, cacheKey);

   // Build giget source string
   let source = url;

   if (source.startsWith('https://github.com/')) {
      source = source.replace('https://github.com/', 'gh:');
   } else if (source.startsWith('https://gitlab.com/')) {
      source = source.replace('https://gitlab.com/', 'gitlab:');
   }

   if (ref) {
      source = `${source}#${ref}`;
   }

   // Check if cache already exists
   const cachedFilePath = join(cachePath, filePath);

   try {
      const content = await readFile(cachedFilePath, 'utf-8');

      return {
         content: content.trim(),
         sourcePath: `${url}#${ref}:${filePath}`,
      };
   } catch {
      // Cache miss - download using giget
   }

   const { dir } = await downloadTemplate(source, {
      dir: cachePath,
      force: true,
   });

   const content = await readFile(join(dir, filePath), 'utf-8');

   return {
      content: content.trim(),
      sourcePath: `${url}#${ref}:${filePath}`,
   };
}
