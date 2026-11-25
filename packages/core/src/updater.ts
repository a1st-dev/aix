import { resolve, dirname, join } from 'pathe';
import detectIndent from 'detect-indent';
import { parseConfig, parseLocalConfig, applyJsoncDiff, type AiJsonConfig } from '@a1st/aix-schema';
import { parseConfigContent } from './discovery.js';
import { createBackup } from './backup.js';
import { ConfigNotFoundError } from './errors.js';
import { getRuntimeAdapter } from './runtime/index.js';

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
         absolutePath = resolve(configPath),
         { fs, process: runtimeProcess } = getRuntimeAdapter();

   if (!fs.existsSync(absolutePath)) {
      throw new ConfigNotFoundError(absolutePath);
   }

   // Create backup before modifying (per QA spec)
   if (backup) {
      await createBackup(absolutePath);
   }

   // Read and parse the raw file content WITHOUT resolving extends. This preserves the original
   // structure including extends and relative paths, which is critical for config files that
   // inherit from remote sources.
   const existingContent = await fs.readFile(absolutePath, 'utf-8'),
         indent = detectIndent(existingContent).indent || DEFAULT_INDENT,
         rawConfig = parseConfigContent(existingContent) as AiJsonConfig,
         updated = await updater(rawConfig),
         // Use unique temp file name to avoid collisions (pid + timestamp)
         tempPath = `${absolutePath}.${runtimeProcess.pid()}.${Date.now()}.tmp`,
         tabSize = typeof indent === 'string' ? indent.length : indent;

   // Validation only checks the result. What gets written is the updater's own output: the
   // parsed form drops keys the schema does not know and adds a default for every section,
   // which would rewrite parts of the user's file that the update never touched.
   parseConfig(updated);

   const output = applyJsoncDiff(existingContent, updated, { tabSize });

   try {
      await fs.writeFile(tempPath, output, 'utf-8');
      await fs.rename(tempPath, absolutePath);
   } catch (error) {
      if (fs.existsSync(tempPath)) {
         await fs.unlink(tempPath);
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
   const { backup = true } = options,
         { fs, process: runtimeProcess } = getRuntimeAdapter();

   // If localPath is a directory, append ai.local.json
   let absolutePath = resolve(localPath);

   if (!absolutePath.endsWith('.json')) {
      absolutePath = join(absolutePath, 'ai.local.json');
   }

   // Load existing local config or start with empty object
   let existingConfig: Partial<AiJsonConfig> = {},
       existingContent: string | null = null,
       indent: string | number = DEFAULT_INDENT;

   if (fs.existsSync(absolutePath)) {
      if (backup) {
         await createBackup(absolutePath);
      }
      existingContent = await fs.readFile(absolutePath, 'utf-8');

      existingConfig = parseConfigContent(existingContent) as Partial<AiJsonConfig>;
      indent = detectIndent(existingContent).indent || DEFAULT_INDENT;
   } else {
      // Ensure parent directory exists
      await fs.mkdir(dirname(absolutePath), { recursive: true });
   }

   const updated = await updater(existingConfig),
         tempPath = `${absolutePath}.${runtimeProcess.pid()}.${Date.now()}.tmp`,
         tabSize = typeof indent === 'string' ? indent.length : indent;

   // Validate as local config (no extends allowed). As in updateConfig, the parsed form is
   // not what gets written.
   parseLocalConfig(updated);

   const output = existingContent
      ? applyJsoncDiff(existingContent, updated, { tabSize })
      : JSON.stringify(updated, null, indent) + '\n';

   try {
      await fs.writeFile(tempPath, output, 'utf-8');
      await fs.rename(tempPath, absolutePath);
   } catch (error) {
      if (fs.existsSync(tempPath)) {
         await fs.unlink(tempPath);
      }
      throw error;
   }
}
