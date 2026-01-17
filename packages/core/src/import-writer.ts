import { mkdir, writeFile, rename, access, constants } from 'node:fs/promises';
import { join } from 'pathe';
import {
   getImportedDir,
   getImportStagingDir,
   getImportBackupDir,
} from './cache/paths.js';
import { safeRm } from './fs/safe-rm.js';

export interface WrittenImports {
   rules: Record<string, string>;
   prompts: Record<string, string>;
}

export interface ImportContent {
   rules: string[];
   prompts: Record<string, string>;
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
      await mkdir(getImportBackupDir(projectRoot), { recursive: true });
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
