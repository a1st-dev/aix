import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'pathe';
import { tmpdir } from 'node:os';
import type { RuleValue, RuleObject, ActivationMode, RulesConfig } from '@a1st/aix-schema';
import { normalizeSourceRef } from '@a1st/aix-schema';
import { getRulesCacheDir } from '../cache/paths.js';
import { loadFromGit } from '../git-loader.js';
import { resolveNpmPath } from '../npm/resolve.js';
import { parseRuleFrontmatter } from '../frontmatter-parser.js';

export interface LoadedRule {
   name: string;
   content: string;
   source: 'inline' | 'file' | 'git' | 'npm';
   sourcePath?: string;
   metadata: {
      description?: string;
      activation: ActivationMode;
      globs?: string[];
   };
}

/**
 * Load a single rule from any source.
 * @param name - The rule name (key from the rules object)
 * @param value - The rule value (string shorthand or object)
 * @param basePath - Base path for resolving relative paths
 */
export async function loadRule(name: string, value: RuleValue, basePath: string): Promise<LoadedRule> {
   // Normalize string shorthand transparently
   const ruleObj: RuleObject = typeof value === 'string' ? normalizeSourceRef(value) : value;
   const metadata = {
      description: ruleObj.description,
      activation: (ruleObj.activation ?? 'always') as ActivationMode,
      globs: ruleObj.globs,
   };

   // Inline content
   if (ruleObj.content) {
      return {
         name,
         content: ruleObj.content,
         source: 'inline',
         metadata,
      };
   }

   // Local file
   if (ruleObj.path) {
      const fullPath = resolve(dirname(basePath), ruleObj.path),
            rawContent = await readFile(fullPath, 'utf-8'),
            parsed = parseRuleFrontmatter(rawContent.trim());

      return {
         name,
         content: parsed.content,
         source: 'file',
         sourcePath: fullPath,
         metadata: {
            description: metadata.description ?? parsed.metadata.description,
            activation: metadata.activation !== 'always' ? metadata.activation : (parsed.metadata.activation ?? metadata.activation),
            globs: metadata.globs ?? parsed.metadata.globs,
         },
      };
   }

   // Git repository
   if (ruleObj.git) {
      const baseDir = dirname(basePath) || tmpdir(),
            result = await loadFromGit({
               git: ruleObj.git,
               cacheDir: getRulesCacheDir(baseDir),
               defaultFilePath: 'RULES.md',
            }),
            parsed = parseRuleFrontmatter(result.content);

      return {
         name,
         content: parsed.content,
         source: 'git',
         sourcePath: result.sourcePath,
         metadata: {
            description: metadata.description ?? parsed.metadata.description,
            activation: metadata.activation !== 'always' ? metadata.activation : (parsed.metadata.activation ?? metadata.activation),
            globs: metadata.globs ?? parsed.metadata.globs,
         },
      };
   }

   // NPM package
   if (ruleObj.npm) {
      const filePath = await resolveNpmPath({
               packageName: ruleObj.npm.npm,
               subpath: ruleObj.npm.path,
               version: ruleObj.npm.version,
               projectRoot: dirname(basePath),
            }),
            rawContent = await readFile(filePath, 'utf-8'),
            parsed = parseRuleFrontmatter(rawContent.trim());

      return {
         name,
         content: parsed.content,
         source: 'npm',
         sourcePath: filePath,
         metadata: {
            description: metadata.description ?? parsed.metadata.description,
            activation: metadata.activation !== 'always' ? metadata.activation : (parsed.metadata.activation ?? metadata.activation),
            globs: metadata.globs ?? parsed.metadata.globs,
         },
      };
   }

   throw new Error(`Invalid rule "${name}": no content source found`);
}

/**
 * Load all rules from a rules config object.
 * @param rules - Rules config object (keyed by name)
 * @param basePath - Base path for resolving relative paths
 * @returns Record of loaded rules keyed by name
 */
export async function loadRules(
   rules: RulesConfig,
   basePath: string,
): Promise<Record<string, LoadedRule>> {
   // Filter out false values (disabled rules)
   const entries = Object.entries(rules).filter(([, value]) => value !== false);
   const loadedEntries = await Promise.all(
      entries.map(async ([name, value]) => {
         // Type assertion safe because we filtered out false above
         const loaded = await loadRule(name, value as Exclude<typeof value, false>, basePath);

         return [name, loaded] as const;
      }),
   );

   return Object.fromEntries(loadedEntries);
}
