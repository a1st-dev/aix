import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'pathe';
import { tmpdir } from 'node:os';
import type { PromptObject, PromptValue, PromptsConfig } from '@a1st/aix-schema';
import { normalizeSourceRef } from '@a1st/aix-schema';
import { getPromptsCacheDir } from '../cache/paths.js';
import { loadFromGit } from '../git-loader.js';
import { resolveNpmPath } from '../npm/resolve.js';

/**
 * Strip YAML frontmatter from markdown content and optionally extract metadata.
 * Returns the content without frontmatter and any extracted metadata.
 */
function stripFrontmatter(content: string): { content: string; metadata?: Record<string, string> } {
   const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

   if (!frontmatterMatch) {
      return { content };
   }

   const frontmatterContent = frontmatterMatch[1]!;
   const contentWithoutFrontmatter = content.slice(frontmatterMatch[0].length);

   // Parse simple key: value pairs from frontmatter
   const metadata: Record<string, string> = {};

   for (const line of frontmatterContent.split('\n')) {
      const match = line.match(/^([\w-]+):\s*["']?([^"']*)["']?\s*$/);

      if (match) {
         metadata[match[1]!] = match[2]!;
      }
   }

   return { content: contentWithoutFrontmatter.trim(), metadata };
}

export interface LoadedPrompt {
   name: string;
   content: string;
   description?: string;
   argumentHint?: string;
   sourcePath?: string;
}

/**
 * Load a single prompt from any source.
 * @param name - The prompt name (key from the prompts object)
 * @param value - The prompt value (string shorthand or object)
 * @param basePath - Base path for resolving relative paths
 */
export async function loadPrompt(
   name: string,
   value: PromptValue,
   basePath: string,
): Promise<LoadedPrompt> {
   // Normalize string shorthand transparently
   const promptObj: PromptObject = typeof value === 'string' ? normalizeSourceRef(value) : value;
   const base = {
      name,
      description: promptObj.description,
      argumentHint: promptObj.argumentHint,
   };

   // Inline content
   if (promptObj.content) {
      return {
         ...base,
         content: promptObj.content,
      };
   }

   // Local file
   if (promptObj.path) {
      const fullPath = resolve(dirname(basePath), promptObj.path);
      const rawContent = await readFile(fullPath, 'utf-8');
      const { content, metadata } = stripFrontmatter(rawContent.trim());

      return {
         ...base,
         // Use frontmatter description if not explicitly provided
         description: base.description ?? metadata?.description,
         content,
         sourcePath: fullPath,
      };
   }

   // Git repository
   if (promptObj.git) {
      const baseDir = dirname(basePath) || tmpdir();
      const result = await loadFromGit({
         git: promptObj.git,
         cacheDir: getPromptsCacheDir(baseDir),
         defaultFilePath: 'prompt.md',
      });
      const { content, metadata } = stripFrontmatter(result.content);

      return {
         ...base,
         // Use frontmatter description if not explicitly provided
         description: base.description ?? metadata?.description,
         content,
         sourcePath: result.sourcePath,
      };
   }

   // NPM package
   if (promptObj.npm) {
      const filePath = await resolveNpmPath({
         packageName: promptObj.npm.npm,
         subpath: promptObj.npm.path,
         version: promptObj.npm.version,
         projectRoot: dirname(basePath),
      });
      const rawContent = await readFile(filePath, 'utf-8');
      const { content, metadata } = stripFrontmatter(rawContent.trim());

      return {
         ...base,
         description: base.description ?? metadata?.description,
         content,
         sourcePath: filePath,
      };
   }

   throw new Error(`Invalid prompt "${name}": no content source found`);
}

/**
 * Load all prompts from a prompts config object.
 * @param prompts - Prompts config object (keyed by name)
 * @param basePath - Base path for resolving relative paths
 * @returns Record of loaded prompts keyed by name
 */
export async function loadPrompts(
   prompts: PromptsConfig,
   basePath: string,
): Promise<Record<string, LoadedPrompt>> {
   // Filter out false values (disabled prompts)
   const entries = Object.entries(prompts).filter(([, value]) => value !== false);
   const loadedEntries = await Promise.all(
      entries.map(async ([name, value]) => {
         // Type assertion safe because we filtered out false above
         const loaded = await loadPrompt(name, value as Exclude<typeof value, false>, basePath);

         return [name, loaded] as const;
      }),
   );

   return Object.fromEntries(loadedEntries);
}
