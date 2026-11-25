import { basename, resolve, dirname, join } from 'pathe';
import detectIndent from 'detect-indent';
import { parseConfig, parseLocalConfig, applyJsoncDiff, type AiJsonConfig } from '@a1st/aix-schema';
import { parseConfigContent } from './discovery.js';
import { createBackup } from './backup.js';
import { ConfigNotFoundError } from './errors.js';
import { replaceFile } from './fs/replace-file.js';
import { getRuntimeAdapter } from './runtime/index.js';
import { isRecord } from './type-guards.js';

const DEFAULT_INDENT = 2;

export type ConfigUpdater = (config: AiJsonConfig) => AiJsonConfig | Promise<AiJsonConfig>;
export type LocalConfigUpdater = (
   config: Partial<AiJsonConfig>,
) => Partial<AiJsonConfig> | Promise<Partial<AiJsonConfig>>;

export interface UpdateOptions {
   /** Create a backup before updating (default: true) */
   backup?: boolean;
}

type PackageJsonWithConfig = Record<string, unknown> & { ai: Record<string, unknown> };

/** Whether the config is the `ai` field of a package.json, which is then the part to change. */
function isEmbeddedConfig(path: string, document: unknown): document is PackageJsonWithConfig {
   return basename(path) === 'package.json' && isRecord(document) && isRecord(document.ai);
}

export async function updateConfig(
   configPath: string,
   updater: ConfigUpdater,
   options: UpdateOptions = {},
): Promise<void> {
   const { backup = true } = options,
         absolutePath = resolve(configPath),
         { fs } = getRuntimeAdapter();

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
         document = parseConfigContent(existingContent),
         isEmbedded = isEmbeddedConfig(absolutePath, document),
         rawConfig = (isEmbedded ? document.ai : document) as AiJsonConfig,
         updated = await updater(rawConfig),
         tabSize = typeof indent === 'string' ? indent.length : indent;

   // Validation only checks the result. What gets written is the updater's own output: the
   // parsed form drops keys the schema does not know and adds a default for every section,
   // which would rewrite parts of the user's file that the update never touched.
   parseConfig(updated);

   const output = applyJsoncDiff(existingContent, isEmbedded ? { ...document, ai: updated } : updated, { tabSize });

   await replaceFile(absolutePath, output);
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
         { fs } = getRuntimeAdapter();

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
         tabSize = typeof indent === 'string' ? indent.length : indent;

   // Validate as local config (no extends allowed). As in updateConfig, the parsed form is
   // not what gets written.
   parseLocalConfig(updated);

   const output = existingContent
      ? applyJsoncDiff(existingContent, updated, { tabSize })
      : JSON.stringify(updated, null, indent) + '\n';

   await replaceFile(absolutePath, output);
}
