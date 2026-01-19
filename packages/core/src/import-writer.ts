import { mkdir, writeFile, rename, access, constants, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'pathe';
import type { AiJsonConfig } from '@a1st/aix-schema';
import {
   getImportedDir,
   getImportStagingDir,
   getImportBackupDir,
} from './cache/paths.js';
import { safeRm } from './fs/safe-rm.js';
import type { GitSourceInfo } from './remote-loader.js';

export interface WrittenImports {
   rules: Record<string, string>;
   prompts: Record<string, string>;
}

export interface ImportContent {
   rules: string[];
   prompts: Record<string, string>;
}

export interface LocalizedConfig {
   /** The config with paths updated to point to local copies */
   config: Partial<AiJsonConfig>;
   /** Number of files that were copied */
   filesCopied: number;
   /** Warnings about files that couldn't be copied */
   warnings: string[];
}

/**
 * Sanitize a string for use as a filename.
 */
function sanitizeFileName(name: string): string {
   return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
}

/**
 * Check if a directory exists.
 */
async function dirExists(path: string): Promise<boolean> {
   try {
      await access(path, constants.F_OK);
      return true;
   } catch {
      return false;
   }
}

/**
 * Write imported content to staging directory and return path references.
 * Files are written to `.aix/.tmp/import-staging/` and path references
 * point to the final location `.aix/imported/`.
 *
 * @param projectRoot - The project root directory
 * @param content - The imported content (rules and prompts)
 * @returns Path references for rules and prompts (relative to project root)
 */
export async function writeImportedContent(
   projectRoot: string,
   content: ImportContent,
): Promise<WrittenImports> {
   const stagingDir = getImportStagingDir(projectRoot),
         stagingRulesDir = join(stagingDir, 'rules'),
         stagingPromptsDir = join(stagingDir, 'prompts'),
         result: WrittenImports = { rules: {}, prompts: {} };

   // Clean any existing staging
   await safeRm(stagingDir, { force: true });

   // Create staging directories
   await mkdir(stagingRulesDir, { recursive: true });
   await mkdir(stagingPromptsDir, { recursive: true });

   // Build rule write operations
   const ruleWrites = content.rules.map((ruleContent, i) => {
      const name = `imported-rule-${i + 1}`,
            fileName = `${sanitizeFileName(name)}.md`,
            stagingPath = join(stagingRulesDir, fileName),
            relativePath = `./.aix/imported/rules/${fileName}`;

      result.rules[name] = relativePath;
      return writeFile(stagingPath, ruleContent, 'utf-8');
   });

   // Build prompt write operations
   const promptWrites = Object.entries(content.prompts).map(([name, promptContent]) => {
      const fileName = `${sanitizeFileName(name)}.md`,
            stagingPath = join(stagingPromptsDir, fileName),
            relativePath = `./.aix/imported/prompts/${fileName}`;

      result.prompts[name] = relativePath;
      return writeFile(stagingPath, promptContent, 'utf-8');
   });

   // Execute all writes in parallel
   await Promise.all([...ruleWrites, ...promptWrites]);

   return result;
}

/**
 * Commit staged import: backup existing, move staging to final location, cleanup.
 * This should be called after ai.json has been successfully written.
 *
 * @param projectRoot - The project root directory
 */
export async function commitImport(projectRoot: string): Promise<void> {
   const stagingDir = getImportStagingDir(projectRoot),
         finalDir = getImportedDir(projectRoot),
         backupDir = getImportBackupDir(projectRoot);

   // If staging directory doesn't exist, nothing was staged - skip commit
   if (!(await dirExists(stagingDir))) {
      return;
   }

   // Clean any existing backup
   await safeRm(backupDir, { force: true });

   // If final directory exists, move it to backup
   if (await dirExists(finalDir)) {
      await mkdir(dirname(backupDir), { recursive: true });
      await rename(finalDir, backupDir);
   }

   // Move staging to final location
   await mkdir(join(projectRoot, '.aix'), { recursive: true });
   await rename(stagingDir, finalDir);

   // Clean up backup (success path)
   await safeRm(backupDir, { force: true });
}

/**
 * Rollback import: delete staging, restore backup if exists.
 * This should be called if ai.json write or any subsequent step fails.
 *
 * @param projectRoot - The project root directory
 */
export async function rollbackImport(projectRoot: string): Promise<void> {
   const stagingDir = getImportStagingDir(projectRoot),
         finalDir = getImportedDir(projectRoot),
         backupDir = getImportBackupDir(projectRoot);

   // Delete staging directory
   await safeRm(stagingDir, { force: true });

   // If backup exists, restore it
   if (await dirExists(backupDir)) {
      // Remove any partial final directory
      await safeRm(finalDir, { force: true });
      // Restore backup
      await rename(backupDir, finalDir);
   }
}

/**
 * Check if a path is a relative local path (starts with ./ or ../).
 */
function isRelativePath(path: string): boolean {
   return path.startsWith('./') || path.startsWith('../');
}

/**
 * Copy a file from source to destination, creating directories as needed.
 */
async function copyFileWithDirs(src: string, dest: string): Promise<void> {
   await mkdir(join(dest, '..'), { recursive: true });
   await copyFile(src, dest);
}

interface CopyTask {
   type: 'file' | 'directory';
   src: string;
   dest: string;
   name: string;
   newPath: string;
   itemRef: Record<string, unknown>;
}

/**
 * Extract relative path from a config item if it has one.
 * Handles both string shorthand ("./path.md") and object form ({ path: "./path.md" }).
 */
function getRelativePath(item: unknown): string | undefined {
   // String shorthand: "./rules/general.md"
   if (typeof item === 'string') {
      return isRelativePath(item) ? item : undefined;
   }
   // Object form: { path: "./rules/general.md" }
   if (typeof item !== 'object' || item === null || !('path' in item)) {
      return undefined;
   }
   const path = (item as { path: unknown }).path;

   return typeof path === 'string' && isRelativePath(path) ? path : undefined;
}

/**
 * Build copy tasks for rules, prompts, and skills with relative paths.
 */
function buildCopyTasks(
   config: Partial<AiJsonConfig>,
   configBaseDir: string,
   stagingDir: string,
): { tasks: CopyTask[]; warnings: string[] } {
   const tasks: CopyTask[] = [],
         warnings: string[] = [],
         stagingRulesDir = join(stagingDir, 'rules'),
         stagingPromptsDir = join(stagingDir, 'prompts'),
         stagingSkillsDir = join(stagingDir, 'skills');

   // Process rules
   if (config.rules && typeof config.rules === 'object') {
      for (const [name, rule] of Object.entries(config.rules)) {
         const relativePath = getRelativePath(rule);

         if (!relativePath) {
            continue;
         }
         const srcPath = resolve(configBaseDir, relativePath),
               fileName = basename(srcPath);

         if (!existsSync(srcPath)) {
            warnings.push(`Rule "${name}": source file not found: ${relativePath}`);
            continue;
         }

         // Convert string shorthand to object form if needed
         if (typeof rule === 'string') {
            config.rules[name] = { path: rule };
         }

         tasks.push({
            type: 'file',
            src: srcPath,
            dest: join(stagingRulesDir, fileName),
            name,
            newPath: `./.aix/imported/rules/${fileName}`,
            itemRef: config.rules[name] as Record<string, unknown>,
         });
      }
   }

   // Process prompts
   if (config.prompts && typeof config.prompts === 'object') {
      for (const [name, prompt] of Object.entries(config.prompts)) {
         const relativePath = getRelativePath(prompt);

         if (!relativePath) {
            continue;
         }
         const srcPath = resolve(configBaseDir, relativePath),
               fileName = basename(srcPath);

         if (!existsSync(srcPath)) {
            warnings.push(`Prompt "${name}": source file not found: ${relativePath}`);
            continue;
         }

         // Convert string shorthand to object form if needed
         if (typeof prompt === 'string') {
            config.prompts[name] = { path: prompt };
         }

         tasks.push({
            type: 'file',
            src: srcPath,
            dest: join(stagingPromptsDir, fileName),
            name,
            newPath: `./.aix/imported/prompts/${fileName}`,
            itemRef: config.prompts[name] as Record<string, unknown>,
         });
      }
   }

   // Process skills
   if (config.skills && typeof config.skills === 'object') {
      for (const [name, skill] of Object.entries(config.skills)) {
         const relativePath = getRelativePath(skill);

         if (!relativePath) {
            continue;
         }
         const srcPath = resolve(configBaseDir, relativePath);

         if (!existsSync(srcPath)) {
            warnings.push(`Skill "${name}": source directory not found: ${relativePath}`);
            continue;
         }
         tasks.push({
            type: 'directory',
            src: srcPath,
            dest: join(stagingSkillsDir, name),
            name,
            newPath: `./.aix/imported/skills/${name}`,
            itemRef: skill as Record<string, unknown>,
         });
      }
   }

   return { tasks, warnings };
}

/**
 * Localize a remote config by copying referenced files to .aix/imported/ and updating paths.
 * This handles rules, prompts, and skills that have relative path references.
 *
 * @param config - The remote config to localize
 * @param configBaseDir - The base directory where the remote config's files are located
 * @param projectRoot - The local project root where files should be copied to
 * @returns The localized config with updated paths
 */
export async function localizeRemoteConfig(
   config: Partial<AiJsonConfig>,
   configBaseDir: string,
   projectRoot: string,
): Promise<LocalizedConfig> {
   const stagingDir = getImportStagingDir(projectRoot);

   // Clean any existing staging
   await safeRm(stagingDir, { force: true });

   // Create staging directories
   await mkdir(join(stagingDir, 'rules'), { recursive: true });
   await mkdir(join(stagingDir, 'prompts'), { recursive: true });
   await mkdir(join(stagingDir, 'skills'), { recursive: true });

   // Deep clone the config to avoid mutating the original
   const localizedConfig = JSON.parse(JSON.stringify(config)) as Partial<AiJsonConfig>;

   // Build copy tasks
   const { tasks, warnings } = buildCopyTasks(localizedConfig, configBaseDir, stagingDir);

   // Execute copy tasks in parallel (files) or sequentially (directories)
   const fileTasks = tasks.filter((t) => t.type === 'file'),
         dirTasks = tasks.filter((t) => t.type === 'directory');

   // Copy files in parallel
   await Promise.all(fileTasks.map((task) => copyFileWithDirs(task.src, task.dest)));

   // Copy directories sequentially (recursive operations)
   for (const task of dirTasks) {
      await copyDirectory(task.src, task.dest); // eslint-disable-line no-await-in-loop -- Recursive dir copy
   }

   // Update paths in the cloned config
   for (const task of tasks) {
      task.itemRef.path = task.newPath;
   }

   return { config: localizedConfig, filesCopied: tasks.length, warnings };
}

/**
 * Recursively copy a directory.
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
   const { readdir } = await import('node:fs/promises');

   await mkdir(dest, { recursive: true });

   const entries = await readdir(src, { withFileTypes: true });

   // Separate files and directories
   const files = entries.filter((e) => !e.isDirectory()),
         dirs = entries.filter((e) => e.isDirectory());

   // Copy files in parallel
   await Promise.all(files.map((entry) => copyFile(join(src, entry.name), join(dest, entry.name))));

   // Copy directories sequentially
   for (const entry of dirs) {
      await copyDirectory(join(src, entry.name), join(dest, entry.name)); // eslint-disable-line no-await-in-loop -- Recursive
   }
}

/** Result of converting relative paths to git references */
export interface GitRefsConversionResult {
   /** The config with relative paths converted to git references */
   config: Partial<AiJsonConfig>;
   /** Number of items converted to git references */
   convertedCount: number;
   /** Details of each converted reference for display */
   converted: Array<{ name: string; type: 'rule' | 'prompt' | 'skill'; gitRef: string }>;
}

/**
 * Build a git shorthand URL from GitSourceInfo.
 * e.g., "github:owner/repo"
 */
function buildGitShorthand(gitSource: GitSourceInfo): string {
   return `${gitSource.provider}:${gitSource.owner}/${gitSource.repo}`;
}

/**
 * Compute the full path from repo root for a relative path in the config.
 * If configPath is "configs/ai.json" and relativePath is "./rules/style.md",
 * the result is "configs/rules/style.md".
 */
function computeRepoRootPath(configPath: string | undefined, relativePath: string): string {
   // Remove leading ./ from relative path
   const cleanRelative = relativePath.replace(/^\.\//, '');

   if (!configPath) {
      return cleanRelative;
   }

   // Get the directory containing the config file
   const configDir = dirname(configPath);

   // If config is at root (e.g., "ai.json"), just use the relative path
   if (configDir === '.' || configDir === '') {
      return cleanRelative;
   }

   // Join the config directory with the relative path
   return join(configDir, cleanRelative);
}

/**
 * Convert a config with relative paths to use git references instead.
 * This is used when saving a remote git config with --save to preserve
 * the git source rather than copying files locally.
 *
 * @param config - The config with relative paths
 * @param gitSource - Git source metadata from the remote loader
 * @returns The config with git references and conversion details
 */
export function convertToGitReferences(
   config: Partial<AiJsonConfig>,
   gitSource: GitSourceInfo,
): GitRefsConversionResult {
   // Deep clone to avoid mutating the original
   const result = JSON.parse(JSON.stringify(config)) as Partial<AiJsonConfig>,
         converted: GitRefsConversionResult['converted'] = [],
         gitUrl = buildGitShorthand(gitSource);

   // Process rules
   if (result.rules && typeof result.rules === 'object') {
      for (const [name, rule] of Object.entries(result.rules)) {
         const relativePath = getRelativePath(rule);

         if (!relativePath) {
            continue;
         }

         const repoPath = computeRepoRootPath(gitSource.configPath, relativePath),
               gitRef = {
                  url: gitUrl,
                  ...(gitSource.ref && { ref: gitSource.ref }),
                  path: repoPath,
               };

         // Preserve other properties from object form (description, activation, globs)
         if (typeof rule === 'object' && rule !== null) {
            const { path: _path, content: _content, git: _git, npm: _npm, ...rest } = rule as Record<string, unknown>;

            result.rules[name] = { ...rest, git: gitRef };
         } else {
            result.rules[name] = { git: gitRef };
         }

         converted.push({
            name,
            type: 'rule',
            gitRef: `${gitUrl}${gitSource.ref ? `#${gitSource.ref}` : ''}:${repoPath}`,
         });
      }
   }

   // Process prompts
   if (result.prompts && typeof result.prompts === 'object') {
      for (const [name, prompt] of Object.entries(result.prompts)) {
         const relativePath = getRelativePath(prompt);

         if (!relativePath) {
            continue;
         }

         const repoPath = computeRepoRootPath(gitSource.configPath, relativePath),
               gitRef = {
                  url: gitUrl,
                  ...(gitSource.ref && { ref: gitSource.ref }),
                  path: repoPath,
               };

         // Preserve other properties from object form (description, argumentHint)
         if (typeof prompt === 'object' && prompt !== null) {
            const { path: _path, content: _content, git: _git, npm: _npm, ...rest } = prompt as Record<string, unknown>;

            result.prompts[name] = { ...rest, git: gitRef };
         } else {
            result.prompts[name] = { git: gitRef };
         }

         converted.push({
            name,
            type: 'prompt',
            gitRef: `${gitUrl}${gitSource.ref ? `#${gitSource.ref}` : ''}:${repoPath}`,
         });
      }
   }

   // Process skills
   if (result.skills && typeof result.skills === 'object') {
      for (const [name, skill] of Object.entries(result.skills)) {
         const relativePath = getRelativePath(skill);

         if (!relativePath) {
            continue;
         }

         // Strip trailing slash from skill paths (giget doesn't handle them well)
         const repoPath = computeRepoRootPath(gitSource.configPath, relativePath).replace(/\/$/, ''),
               gitRef = {
                  git: gitUrl,
                  ...(gitSource.ref && { ref: gitSource.ref }),
                  path: repoPath,
               };

         // Skills use a different schema - check if it's the extended form with enabled/config
         if (typeof skill === 'object' && skill !== null && ('enabled' in skill || 'config' in skill)) {
            const { path: _path, source: _source, git: _git, ...rest } = skill as Record<string, unknown>;

            result.skills[name] = { ...rest, ...gitRef };
         } else {
            result.skills[name] = gitRef;
         }

         converted.push({
            name,
            type: 'skill',
            gitRef: `${gitUrl}${gitSource.ref ? `#${gitSource.ref}` : ''}:${repoPath}`,
         });
      }
   }

   return { config: result, convertedCount: converted.length, converted };
}
