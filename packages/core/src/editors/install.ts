import pMap from 'p-map';
import { join } from 'pathe';
import type { AiJsonConfig } from '@a1st/aix-schema';
import type { EditorAdapter, EditorName, ApplyOptions, ApplyResult, GlobalChangesInfo, FileChange } from './types.js';
import { parseTOML, stringifyTOML } from 'confbox';
import { parseJsonc, modifyJsonc } from '@a1st/aix-schema';
import { isRecord } from '../type-guards.js';
import { planInstallReceipt } from './install-receipts.js';
import { applyFileChanges, getFileChangeAction } from './apply-file-changes.js';
import { deepMergeJson, mcpConfigMergeResolver } from '../json.js';
import { isCI } from '../env/ci.js';
import {
   editorInputNames,
   editorNames,
   normalizeEditorName,
   normalizeEditorNames,
   type EditorInputName,
} from './types.js';
import {
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   CopilotAdapter,
   ZedAdapter,
   CodexAdapter,
   AntigravityAdapter,
   OpenCodeAdapter,
   GrokAdapter,
} from './adapters/index.js';
import { analyzeGlobalChanges, applyGlobalChanges } from '../global/processor.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { getRuntimeAdapter } from '../runtime/index.js';

function assertGlobalHomeAccess(action: string): void {
   if (!getRuntimeAdapter().host.supportsGlobalHomeAccess()) {
      throw new UnsupportedRuntimeCapabilityError('global-home-access', action);
   }
}

/**
 * Registry of all available editor adapters.
 */
const adapters: Record<EditorName, new () => EditorAdapter> = {
   windsurf: WindsurfAdapter,
   cursor: CursorAdapter,
   'claude-code': ClaudeCodeAdapter,
   copilot: CopilotAdapter,
   zed: ZedAdapter,
   codex: CodexAdapter,
   antigravity: AntigravityAdapter,
   opencode: OpenCodeAdapter,
   grok: GrokAdapter,
};

/**
 * Get an adapter instance for a specific editor.
 */
export function getAdapter(editor: string): EditorAdapter {
   const editorName = normalizeEditorName(editor),
         AdapterClass = adapters[editorName];

   if (!AdapterClass) {
      throw new Error(`Unknown editor: ${editor}`);
   }
   return new AdapterClass();
}

/**
 * Get all available editor names.
 */
export function getAvailableEditors(): EditorName[] {
   return [ ...editorNames ];
}

/**
 * Get all editor names accepted as user input, including aliases.
 */
export function getAcceptedEditorNames(): EditorInputName[] {
   return [ ...editorInputNames ];
}

/**
 * Check if an editor is installed globally on the system by looking for its config/data directory.
 */
async function isEditorInstalledGlobally(editor: EditorName): Promise<boolean> {
   assertGlobalHomeAccess('detecting globally installed editors');

   const adapter = getAdapter(editor),
         globalPaths = adapter.getGlobalDataPaths(),
         paths = globalPaths[getRuntimeAdapter().os.platform()];

   if (!paths) {
      return false;
   }

   const home = getRuntimeAdapter().os.homedir();

   // Check paths sequentially - return on first match (first-match lookup)
   for (const p of paths) {
      try {
         // eslint-disable-next-line no-await-in-loop -- Sequential: first-match lookup
         await getRuntimeAdapter().fs.access(join(home, p), getRuntimeAdapter().fs.constants.F_OK);
         return true;
      } catch {
         // Continue checking other paths
      }
   }
   return false;
}

/**
 * Check if an editor has a config directory in the project (e.g., `.windsurf/`, `.cursor/`).
 */
async function isEditorConfiguredInProject(editor: EditorName, projectRoot: string): Promise<boolean> {
   const adapter = getAdapter(editor);

   return adapter.detect(projectRoot);
}

/**
 * Detect which editors are available. By default, checks for editors installed globally on the
 * system. If `projectOnly` is true, only returns editors that have existing config directories in
 * the project.
 */
export async function detectEditors(
   projectRoot: string,
   options: { projectOnly?: boolean } = {},
): Promise<EditorName[]> {
   if (!options.projectOnly) {
      assertGlobalHomeAccess('detecting globally installed editors');
   }

   const editors = getAvailableEditors(),
         checkFn = options.projectOnly
            ? (editor: EditorName) => isEditorConfiguredInProject(editor, projectRoot)
            : isEditorInstalledGlobally;

   const results = await pMap(editors, async (editor) => ({ editor, detected: await checkFn(editor) }), {
      concurrency: 3,
   });

   return results.filter((r) => r.detected).map((r) => r.editor);
}

/**
 * Install configuration to a single editor.
 */
export async function installToEditor(
   editor: string,
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions,
): Promise<ApplyResult> {
   const editorName = normalizeEditorName(editor),
         adapter = getAdapter(editorName),
         targetScope = options?.targetScope ?? 'project',
         unsupportedFeatures = adapter.getUnsupportedFeatures(config),
         // Always reported so every command can warn; only strict mode also strips the
         // affected sections from what gets written.
         targetScopeLimitations = adapter.getTargetScopeLimitations(config, targetScope),
         filteredConfig =
            options?.strictTargetScope && targetScopeLimitations
               ? stripTargetScopeLimitedFeatures(config, targetScopeLimitations)
               : config;

   if (targetScope === 'user') {
      assertGlobalHomeAccess(`installing ${editorName} config into user scope`);
   }

   const editorConfig = await adapter.generateConfig(filteredConfig, projectRoot, options),
         result = await adapter.apply(editorConfig, projectRoot, options);

   // Attach unsupported features to result if any exist
   if (Object.keys(unsupportedFeatures).length > 0) {
      result.unsupportedFeatures = unsupportedFeatures;
   }

   if (
      targetScopeLimitations &&
      (
         targetScopeLimitations.rules ||
         targetScopeLimitations.skills ||
         targetScopeLimitations.hooks ||
         targetScopeLimitations.plugins ||
         targetScopeLimitations.marketplaces
      )
   ) {
      result.targetScopeLimitations = targetScopeLimitations;
   }

   // Handle global-only features (MCP for Windsurf/Codex, Prompts for Codex)
   if (!result.success) {
      return result;
   }

   try {
      const globalChanges = await processGlobalFeatures(adapter, editorConfig, projectRoot, {
         ...options,
         skipGlobal:
            options?.skipGlobal ??
            (options?.strictTargetScope === true && targetScope === 'project'),
         skipGlobalReason:
            options?.skipGlobalReason ??
            (
               options?.strictTargetScope === true && targetScope === 'project'
                  ? 'Requested target scope is project, so aix did not write global-only config'
                  : undefined
            ),
      });

      if (globalChanges) {
         result.globalChanges = globalChanges.info;
         result.changes.push(...globalChanges.changes);
      }
   } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
   }

   return result;
}

function stripTargetScopeLimitedFeatures(
   config: AiJsonConfig,
   limitations: NonNullable<ApplyResult['targetScopeLimitations']>,
): AiJsonConfig {
   const nextConfig: AiJsonConfig = { ...config };

   if (limitations.rules) {
      nextConfig.rules = {};
   }

   if (limitations.skills) {
      nextConfig.skills = {};
   }

   if (limitations.hooks) {
      delete nextConfig.hooks;
   }

   if (limitations.plugins) {
      nextConfig.plugins = {};
   }

   if (limitations.marketplaces) {
      nextConfig.marketplaces = {};
   }

   return nextConfig;
}

/**
 * Process global-only features for an editor.
 * Analyzes what global changes are needed and applies them (with user confirmation in CLI).
 */
async function processGlobalFeatures(
   adapter: EditorAdapter,
   editorConfig: import('./types.js').EditorConfig,
   projectRoot: string,
   options?: ApplyOptions,
): Promise<{ info: GlobalChangesInfo; changes: FileChange[] } | undefined> {
   const { mcpStrategy, promptsStrategy } = adapter.getStrategyBundle(),
         scopes = options?.scopes ?? ['mcp', 'prompts'],
         globalConfig = {
            ...editorConfig,
            mcp: scopes.includes('mcp') ? editorConfig.mcp : {},
            prompts: scopes.includes('prompts') || scopes.includes('editors') ? editorConfig.prompts : [],
         };

   // Check if this editor has any global-only features
   const hasMcpGlobalOnly = mcpStrategy?.isGlobalOnly?.() && scopes.includes('mcp'),
         hasPromptsGlobalOnly = promptsStrategy?.isGlobalOnly?.() && (scopes.includes('prompts') || scopes.includes('editors'));

   if (!hasMcpGlobalOnly && !hasPromptsGlobalOnly) {
      return undefined;
   }

   assertGlobalHomeAccess(`applying global-only ${adapter.name} configuration`);

   // Analyze what global changes are needed
   const changes = await analyzeGlobalChanges(adapter.name, globalConfig, mcpStrategy, promptsStrategy);

   // Apply the changes (respecting skipGlobal and autoConfirmGlobal options)
   const globalResult = await applyGlobalChanges(changes, {
      skipGlobal: options?.skipGlobal,
      skipGlobalReason: options?.skipGlobalReason,
      autoConfirm: options?.autoConfirmGlobal,
      projectPath: projectRoot,
      dryRun: true,
   });

   let receiptChanges: FileChange[] = [];

   if (!options?.skipGlobal && !await isCI()) {
      const installed = [...globalResult.applied, ...globalResult.skipped.filter((change) => {
               return change.configsMatch;
            })],
            nativeChanges: FileChange[] = [],
            contents = new Map<string, string>();

      for (const change of installed) {
         const { fs } = getRuntimeAdapter(),
               exists = fs.existsSync(change.globalPath);
         let content = contents.get(change.globalPath);

         if (content === undefined) {
            // eslint-disable-next-line no-await-in-loop -- Changes sharing one global file must be planned in order.
            content = exists ? await fs.readFile(change.globalPath, 'utf-8') : '{}';
            if (!exists && change.format === 'toml') {
               content = '';
            }
         }

         let desiredContent = change.promptContent ?? content,
             managedContent = change.promptContent;

         if (change.type === 'mcp') {
            const parsed: unknown = change.format === 'toml' ? parseTOML(content) : parseJsonc(content).data,
                  key = change.format === 'toml' ? 'mcp_servers' : 'mcpServers',
                  servers = isRecord(parsed) ? parsed[key] : undefined,
                  entry = change.mcpEntry ?? (isRecord(servers) ? servers[change.name] : undefined);

            if (!isRecord(parsed) || (change.format !== 'toml' && parseJsonc(content).errors.length > 0)) {
               throw new Error(`Cannot merge invalid global config: ${change.globalPath}`);
            }
            if (entry === undefined) {
               throw new Error(`Installed MCP entry is missing: ${change.name}`);
            }

            const contribution = { [key]: { [change.name]: entry } },
                  merged = deepMergeJson(parsed, contribution, { resolver: mcpConfigMergeResolver });

            managedContent = change.format === 'toml' ? stringifyTOML(contribution) : JSON.stringify(contribution);
            desiredContent = change.format === 'toml' ? stringifyTOML(merged) : modifyJsonc(content, [key, change.name], entry);
            if (change.configsMatch) {
               desiredContent = content;
            }
         }

         const action = getFileChangeAction(exists ? content : null, desiredContent);

         contents.set(change.globalPath, desiredContent);
         nativeChanges.push({
            path: change.globalPath, action, content: desiredContent, managedContent,
            category: change.type === 'mcp' ? 'mcp' : 'workflow',
            managedSection: change.type === 'mcp' ? 'mcp' : 'prompts',
         });
      }

      const completedScopes = scopes.filter((section) => {
               return !globalResult.skipped.some((change) => {
                  const matchesSection = change.type === section ||
                     (change.type === 'prompt' && (section === 'prompts' || section === 'editors'));

                  return matchesSection && !change.configsMatch;
               });
            }),
            reconciled = await planInstallReceipt({
               source: options?.configSource ?? join(projectRoot, 'ai.json'),
               editor: `${adapter.name}:global`,
               projectRoot,
               scope: 'user',
               scopes: completedScopes,
               changes: nativeChanges,
            });

      if (!options?.dryRun) {
         await applyFileChanges(reconciled.receiptChange
            ? [...reconciled.changes, reconciled.receiptChange] : reconciled.changes);
      }
      receiptChanges = reconciled.changes.filter((change) => {
         return change.action !== 'unchanged';
      });
   }

   // Convert to GlobalChangesInfo format
   const info: GlobalChangesInfo = {
      applied: globalResult.applied.map((c) => ({
         type: c.type,
         name: c.name,
         globalPath: c.globalPath,
      })),
      skipped: globalResult.skipped.map((c) => ({
         type: c.type,
         name: c.name,
         reason: c.skipReason ?? 'Unknown reason',
      })),
      warnings: globalResult.warnings,
   };

   if (changes.length === 0 && receiptChanges.length === 0) {
      return undefined;
   }

   return { info, changes: receiptChanges };
}

/**
 * Install configuration to multiple editors.
 */
export async function installToEditors(
   editors: readonly string[],
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions,
): Promise<ApplyResult[]> {
   return pMap(normalizeEditorNames(editors), (editor) => installToEditor(editor, config, projectRoot, options), {
      concurrency: 2,
   });
}

/**
 * Install configuration to all detected editors, or specified editors if provided.
 */
export async function install(
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions & { editors?: readonly string[] },
): Promise<ApplyResult[]> {
   const editors = options?.editors ?? (await detectEditors(projectRoot));

   // If no editors detected and none specified, install to all
   const targetEditors = editors.length > 0 ? editors : getAvailableEditors();

   return installToEditors(targetEditors, config, projectRoot, options);
}
