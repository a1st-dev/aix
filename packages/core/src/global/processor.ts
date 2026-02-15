import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'pathe';
import { parseTOML, stringifyTOML } from 'confbox';
import type { McpServerConfig } from '@a1st/aix-schema';
import type { EditorName, EditorConfig } from '../editors/types.js';
import type { McpStrategy, PromptsStrategy } from '../editors/strategies/types.js';
import { GlobalTrackingService, makeTrackingKey } from './tracking.js';
import { mcpConfigsMatch, promptsMatch } from './comparison.js';
import type { GlobalChangeRequest, GlobalChangeResult, GlobalChangeOptions } from './types.js';
import { isCI } from '../env/ci.js';
import { getTransport } from '../mcp/normalize.js';

/** Derive config file format from path extension. */
function getFileFormat(filePath: string): 'json' | 'toml' {
   return filePath.endsWith('.toml') ? 'toml' : 'json';
}

/** Set of global config paths that have been backed up in this session */
const backedUpPaths = new Set<string>();

/**
 * Backup a global config file before modifying it.
 * Backups are stored in ~/.aix/backups/ with timestamps.
 * Only backs up once per path per session to avoid excessive backups.
 */
async function backupGlobalConfig(globalPath: string): Promise<void> {
   if (!existsSync(globalPath) || backedUpPaths.has(globalPath)) {
      return;
   }

   const backupDir = join(homedir(), '.aix', 'backups'),
         timestamp = new Date().toISOString().replace(/[:.]/g, '-'),
         // Include relative path from home to preserve context (e.g., .codeium/windsurf/mcp_config.json)
         relativePath = globalPath.replace(homedir(), '').replace(/^\//, ''),
         safeRelativePath = relativePath.replace(/\//g, '_'),
         backupPath = join(backupDir, `${safeRelativePath}.${timestamp}.bak`);

   try {
      await mkdir(backupDir, { recursive: true });
      await copyFile(globalPath, backupPath);
      backedUpPaths.add(globalPath);
   } catch {
      // Silently fail backup - don't block the operation
   }
}

/**
 * Analyze global-only features and determine what changes are needed.
 * This does NOT modify any files - it just builds a list of change requests.
 */
export async function analyzeGlobalChanges(
   editor: EditorName,
   editorConfig: EditorConfig,
   mcpStrategy: McpStrategy,
   promptsStrategy: PromptsStrategy,
): Promise<GlobalChangeRequest[]> {
   const changes: GlobalChangeRequest[] = [];

   // Analyze MCP servers if strategy is global-only
   if (mcpStrategy.isGlobalOnly?.() && Object.keys(editorConfig.mcp).length > 0) {
      const globalPath = join(homedir(), mcpStrategy.getGlobalMcpConfigPath() ?? ''),
            format = getFileFormat(globalPath);

      // Read existing global config
      let existingMcp: Record<string, McpServerConfig> = {};

      if (existsSync(globalPath)) {
         try {
            const content = await readFile(globalPath, 'utf-8'),
                  { mcp } = mcpStrategy.parseGlobalMcpConfig(content);

            existingMcp = mcp;
         } catch {
            // Ignore parse errors - treat as empty
         }
      }

      // Check each MCP server
      for (const [name, config] of Object.entries(editorConfig.mcp)) {
         const existing = existingMcp[name];

         if (existing) {
            // Server exists - check if configs match
            if (mcpConfigsMatch(config, existing)) {
               changes.push({
                  editor,
                  type: 'mcp',
                  name,
                  action: 'skip',
                  skipReason: 'Already configured identically',
                  globalPath,
                  format,
                  mcpConfig: config,
                  existingMcpConfig: existing,
                  configsMatch: true,
               });
            } else {
               // Configs differ - skip and warn
               changes.push({
                  editor,
                  type: 'mcp',
                  name,
                  action: 'skip',
                  skipReason: 'Existing config differs from ai.json - not modifying',
                  globalPath,
                  format,
                  mcpConfig: config,
                  existingMcpConfig: existing,
                  configsMatch: false,
               });
            }
         } else {
            // Server doesn't exist - needs to be added
            changes.push({
               editor,
               type: 'mcp',
               name,
               action: 'add',
               globalPath,
               format,
               mcpConfig: config,
            });
         }
      }
   }

   // Analyze prompts if strategy is global-only
   if (promptsStrategy.isGlobalOnly?.() && editorConfig.prompts.length > 0) {
      const globalPromptsPath = promptsStrategy.getGlobalPromptsPath();

      if (globalPromptsPath) {
         const promptChanges = await analyzeGlobalPrompts(
            editor,
            editorConfig.prompts,
            globalPromptsPath,
            promptsStrategy,
         );

         changes.push(...promptChanges);
      }
   }

   return changes;
}

/**
 * Analyze global prompts and determine what changes are needed.
 */
async function analyzeGlobalPrompts(
   editor: EditorName,
   prompts: EditorConfig['prompts'],
   globalPromptsPath: string,
   promptsStrategy: PromptsStrategy,
): Promise<GlobalChangeRequest[]> {
   const changes: GlobalChangeRequest[] = [],
         globalDir = join(homedir(), globalPromptsPath),
         ext = promptsStrategy.getFileExtension();

   for (const prompt of prompts) {
      const promptPath = join(globalDir, `${prompt.name}${ext}`),
            formattedContent = promptsStrategy.formatPrompt(prompt);

      // eslint-disable-next-line no-await-in-loop -- Sequential file reads for prompts
      const change = await analyzePromptChange(editor, prompt.name, promptPath, formattedContent);

      changes.push(change);
   }

   return changes;
}

/**
 * Analyze a single prompt and determine what change is needed.
 */
async function analyzePromptChange(
   editor: EditorName,
   name: string,
   promptPath: string,
   formattedContent: string,
): Promise<GlobalChangeRequest> {
   if (!existsSync(promptPath)) {
      return {
         editor,
         type: 'prompt',
         name,
         action: 'add',
         globalPath: promptPath,
         promptContent: formattedContent,
      };
   }

   // Prompt exists - check if content matches
   try {
      const existingContent = await readFile(promptPath, 'utf-8'),
            configsMatch = promptsMatch(formattedContent, existingContent);

      return {
         editor,
         type: 'prompt',
         name,
         action: 'skip',
         skipReason: configsMatch
            ? 'Already configured identically'
            : 'Existing prompt differs from ai.json - not modifying',
         globalPath: promptPath,
         promptContent: formattedContent,
         existingPromptContent: existingContent,
         configsMatch,
      };
   } catch {
      // Can't read - treat as needing add
      return {
         editor,
         type: 'prompt',
         name,
         action: 'add',
         globalPath: promptPath,
         promptContent: formattedContent,
      };
   }
}

/**
 * Apply approved global changes. Writes files and updates tracking.
 */
export async function applyGlobalChanges(
   changes: GlobalChangeRequest[],
   options: GlobalChangeOptions,
): Promise<GlobalChangeResult> {
   const tracking = new GlobalTrackingService(),
         applied: GlobalChangeRequest[] = [],
         skipped: GlobalChangeRequest[] = [],
         warnings: string[] = [];

   // Check if in CI - skip all global changes
   if (await isCI()) {
      for (const change of changes) {
         if (change.action === 'add') {
            skipped.push({
               ...change,
               action: 'skip',
               skipReason: 'Skipped in CI environment',
            });
            warnings.push(
               `[${change.editor}] Skipped global ${change.type} "${change.name}" - CI environment detected`,
            );
         } else {
            skipped.push(change);
         }
      }
      return { applied, skipped, warnings };
   }

   // Process each change
   for (const change of changes) {
      if (change.action === 'skip') {
         skipped.push(change);

         // Only warn if configs don't match (not just "already configured")
         if (!change.configsMatch) {
            warnings.push(
               `[${change.editor}] ${change.type} "${change.name}": ${change.skipReason}`,
            );
         }
         continue;
      }

      // Skip if skipGlobal option is set
      if (options.skipGlobal) {
         skipped.push({
            ...change,
            action: 'skip',
            skipReason: 'Global changes disabled',
         });
         continue;
      }

      // Apply the change
      if (!options.dryRun) {
         try {
            if (change.type === 'mcp' && change.mcpConfig) {
               // For MCP, we need to merge with existing config
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
               await applyMcpChange(change);
            } else if (change.type === 'prompt' && change.promptContent) {
               // Backup before modifying
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
               await backupGlobalConfig(change.globalPath);
               // For prompts, just write the file
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
               await mkdir(dirname(change.globalPath), { recursive: true });
               // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
               await writeFile(change.globalPath, change.promptContent, 'utf-8');
            }

            // Update tracking
            const key = makeTrackingKey(change.editor, change.type, change.name);

            // eslint-disable-next-line no-await-in-loop -- Sequential for atomic operations
            await tracking.addProjectDependency(
               key,
               { type: change.type, editor: change.editor, name: change.name },
               options.projectPath,
            );
         } catch (error) {
            warnings.push(
               `[${change.editor}] Failed to apply ${change.type} "${change.name}": ${(error as Error).message}`,
            );
            skipped.push({
               ...change,
               action: 'skip',
               skipReason: `Failed: ${(error as Error).message}`,
            });
            continue;
         }
      }

      applied.push(change);
   }

   return { applied, skipped, warnings };
}

/**
 * Apply an MCP change by merging with existing config.
 */
async function applyMcpChange(change: GlobalChangeRequest): Promise<void> {
   const globalPath = change.globalPath,
         format = change.format ?? getFileFormat(globalPath);
   let existingConfig: Record<string, unknown> = {};

   // Backup before modifying
   await backupGlobalConfig(globalPath);

   // Read existing config if it exists
   if (existsSync(globalPath)) {
      try {
         const content = await readFile(globalPath, 'utf-8');

         existingConfig = (format === 'toml' ? parseTOML(content) : JSON.parse(content)) as Record<string, unknown>;
      } catch {
         // Start fresh if parse fails
      }
   }

   // MCP server key differs by format: TOML uses mcp_servers, JSON uses mcpServers
   const mcpKey = format === 'toml' ? 'mcp_servers' : 'mcpServers',
         mcpServers = (existingConfig[mcpKey] ?? {}) as Record<string, unknown>;

   if (change.mcpConfig) {
      const transport = getTransport(change.mcpConfig),
            serverConfig: Record<string, unknown> = {};

      if (transport.type === 'stdio') {
         serverConfig.command = transport.command;
         serverConfig.args = transport.args ?? [];
         if (transport.env && Object.keys(transport.env).length > 0) {
            serverConfig.env = transport.env;
         }
      } else if (transport.type === 'http') {
         serverConfig.url = transport.url;
      }

      // Include disabledTools if present
      if ('disabledTools' in change.mcpConfig && Array.isArray(change.mcpConfig.disabledTools)) {
         serverConfig.disabledTools = change.mcpConfig.disabledTools;
      }

      mcpServers[change.name] = serverConfig;
   }

   existingConfig[mcpKey] = mcpServers;

   // Write back in the correct format
   await mkdir(dirname(globalPath), { recursive: true });
   const output = format === 'toml'
      ? stringifyTOML(existingConfig)
      : JSON.stringify(existingConfig, null, 2) + '\n';

   await writeFile(globalPath, output, 'utf-8');
}

/**
 * Get a summary of global changes for display to the user.
 */
export function summarizeGlobalChanges(changes: GlobalChangeRequest[]): {
   toAdd: GlobalChangeRequest[];
   toSkip: GlobalChangeRequest[];
   alreadyConfigured: GlobalChangeRequest[];
} {
   const toAdd = changes.filter((c) => c.action === 'add'),
         toSkip = changes.filter((c) => c.action === 'skip' && !c.configsMatch),
         alreadyConfigured = changes.filter((c) => c.action === 'skip' && c.configsMatch);

   return { toAdd, toSkip, alreadyConfigured };
}

/**
 * Remove an MCP server from a global config file.
 * Returns true if the server was removed, false if it didn't exist.
 */
export async function removeFromGlobalMcpConfig(
   globalPath: string,
   serverName: string,
): Promise<boolean> {
   if (!existsSync(globalPath)) {
      return false;
   }

   const format = getFileFormat(globalPath);

   try {
      const content = await readFile(globalPath, 'utf-8'),
            config = (format === 'toml' ? parseTOML(content) : JSON.parse(content)) as Record<string, unknown>,
            mcpKey = format === 'toml' ? 'mcp_servers' : 'mcpServers',
            mcpServers = config[mcpKey] as Record<string, unknown> | undefined;

      if (!mcpServers || !(serverName in mcpServers)) {
         return false;
      }

      // Backup before modifying
      await backupGlobalConfig(globalPath);

      // Remove the server
      delete mcpServers[serverName];
      config[mcpKey] = mcpServers;

      // Write back in the correct format
      const output = format === 'toml'
         ? stringifyTOML(config)
         : JSON.stringify(config, null, 2) + '\n';

      await writeFile(globalPath, output, 'utf-8');
      return true;
   } catch {
      return false;
   }
}
