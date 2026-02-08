import { writeFile, rename, unlink, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'pathe';
import detectIndent from 'detect-indent';
import { parseConfig, parseLocalConfig, type AiJsonConfig } from '@a1st/aix-schema';
import { parseConfigContent } from './discovery.js';
import { createBackup } from './backup.js';
import { ConfigNotFoundError } from './errors.js';

const DEFAULT_INDENT = 2;

export type ConfigUpdater = (config: AiJsonConfig) => AiJsonConfig | Promise<AiJsonConfig>;
export type LocalConfigUpdater = (
   config: Partial<AiJsonConfig>,
) => Partial<AiJsonConfig> | Promise<Partial<AiJsonConfig>>;

export interface UpdateOptions {
   /** Create a backup before updating (default: true) */
   backup?: boolean;
}

export async function updateConfig(
   configPath: string,
   updater: ConfigUpdater,
   options: UpdateOptions = {},
): Promise<void> {
   const { backup = true } = options,
         absolutePath = resolve(configPath);

   if (!existsSync(absolutePath)) {
      throw new ConfigNotFoundError(absolutePath);
   }

   // Create backup before modifying (per QA spec)
   if (backup) {
      await createBackup(absolutePath);
   }

   // Read and parse the raw file content WITHOUT resolving extends. This preserves the original
   // structure including extends and relative paths, which is critical for config files that
   // inherit from remote sources.
   const existingContent = await readFile(absolutePath, 'utf-8'),
         indent = detectIndent(existingContent).indent || DEFAULT_INDENT,
         rawConfig = parseConfigContent(existingContent) as AiJsonConfig,
         updated = await updater(rawConfig),
         validated = parseConfig(updated),
         // Use unique temp file name to avoid collisions (pid + timestamp)
         tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;

   try {
      await writeFile(tempPath, JSON.stringify(validated, null, indent) + '\n', 'utf-8');
      await rename(tempPath, absolutePath);
   } catch (error) {
      if (existsSync(tempPath)) {
         await unlink(tempPath);
      }
      throw error;
   }
}

/**
 * Update the local config file (ai.local.json).
 * Creates the file if it doesn't exist.
 * @param localPath - Path to ai.local.json (or directory containing it)
 * @param updater - Function to update the config
 * @param options - Update options
 */
export async function updateLocalConfig(
   localPath: string,
   updater: LocalConfigUpdater,
   options: UpdateOptions = {},
): Promise<void> {
   const { backup = true } = options;

   // If localPath is a directory, append ai.local.json
   let absolutePath = resolve(localPath);

   if (!absolutePath.endsWith('.json')) {
      absolutePath = join(absolutePath, 'ai.local.json');
   }

   // Load existing local config or start with empty object
   let existingConfig: Partial<AiJsonConfig> = {},
       indent: string | number = DEFAULT_INDENT;

   if (existsSync(absolutePath)) {
      if (backup) {
         await createBackup(absolutePath);
      }
      const content = await readFile(absolutePath, 'utf-8');

      existingConfig = parseConfigContent(content) as Partial<AiJsonConfig>;
      indent = detectIndent(content).indent || DEFAULT_INDENT;
   } else {
      // Ensure parent directory exists
      await mkdir(dirname(absolutePath), { recursive: true });
   }

   const updated = await updater(existingConfig),
         // Validate as local config (no extends allowed)
         validated = parseLocalConfig(updated),
         tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;

   try {
      await writeFile(tempPath, JSON.stringify(validated, null, indent) + '\n', 'utf-8');
      await rename(tempPath, absolutePath);
   } catch (error) {
      if (existsSync(tempPath)) {
         await unlink(tempPath);
      }
      throw error;
   }
}

/**
 * Get the path to ai.local.json given a base config path.
 * @param configPath - Path to ai.json or directory
 * @returns Path to ai.local.json
 */
export function getLocalConfigPath(configPath: string): string {
   const absolutePath = resolve(configPath);

   if (absolutePath.endsWith('ai.json')) {
      return absolutePath.replace(/ai\.json$/, 'ai.local.json');
   }
   if (absolutePath.endsWith('.json')) {
      return absolutePath.replace(/\.json$/, '.local.json');
   }
   return join(absolutePath, 'ai.local.json');
}
