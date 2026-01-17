import { join } from 'pathe';

/**
 * Get the .aix directory path for a project.
 */
export function getAixDir(projectRoot: string): string {
   return join(projectRoot, '.aix');
}

/**
 * Get the .aix/.tmp directory path (all temporary/cache content).
 */
export function getTmpDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp');
}

/**
 * Get the backups directory path.
 */
export function getBackupsDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'backups');
}

/**
 * Get the cache directory path (git-sourced rules/prompts).
 */
export function getCacheDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'cache');
}

/**
 * Get the rules cache directory path.
 */
export function getRulesCacheDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'cache', 'rules');
}

/**
 * Get the prompts cache directory path.
 */
export function getPromptsCacheDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'cache', 'prompts');
}

/**
 * Get the npm cache directory path (for standalone ai.json).
 */
export function getNpmCacheDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'node_modules');
}

/**
 * Get the skills directory path (persistent, user-managed).
 */
export function getSkillsDir(projectRoot: string): string {
   return join(projectRoot, '.aix', 'skills');
}

/**
 * Get the imported content directory path (persistent, user-managed).
 */
export function getImportedDir(projectRoot: string): string {
   return join(projectRoot, '.aix', 'imported');
}

/**
 * Get the imported rules directory.
 */
export function getImportedRulesDir(projectRoot: string): string {
   return join(projectRoot, '.aix', 'imported', 'rules');
}

/**
 * Get the imported prompts directory.
 */
export function getImportedPromptsDir(projectRoot: string): string {
   return join(projectRoot, '.aix', 'imported', 'prompts');
}

/**
 * Get the import staging directory (temporary, used during atomic import).
 */
export function getImportStagingDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'import-staging');
}

/**
 * Get the import backup directory (temporary, used during atomic import rollback).
 */
export function getImportBackupDir(projectRoot: string): string {
   return join(projectRoot, '.aix', '.tmp', 'import-backup');
}
