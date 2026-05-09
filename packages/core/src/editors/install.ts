import pMap from 'p-map';
import { join } from 'pathe';
import type { AiJsonConfig } from '@a1st/aix-schema';
import type { EditorAdapter, EditorName, ApplyOptions, ApplyResult, GlobalChangesInfo } from './types.js';
import {
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   CopilotAdapter,
   ZedAdapter,
   CodexAdapter,
   GeminiAdapter,
   OpenCodeAdapter,
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
   gemini: GeminiAdapter,
   opencode: OpenCodeAdapter,
};

/**
 * Get an adapter instance for a specific editor.
 */
export function getAdapter(editor: EditorName): EditorAdapter {
   const AdapterClass = adapters[editor];

   if (!AdapterClass) {
      throw new Error(`Unknown editor: ${editor}`);
   }
   return new AdapterClass();
}

/**
 * Get all available editor names.
 */
export function getAvailableEditors(): EditorName[] {
   return Object.keys(adapters) as EditorName[];
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
   editor: EditorName,
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions,
): Promise<ApplyResult> {
   const adapter = getAdapter(editor),
         targetScope = options?.targetScope ?? 'project',
         unsupportedFeatures = adapter.getUnsupportedFeatures(config),
         targetScopeLimitations = options?.strictTargetScope
            ? adapter.getTargetScopeLimitations(config, targetScope)
            : undefined,
         filteredConfig =
            options?.strictTargetScope && targetScopeLimitations
               ? stripTargetScopeLimitedFeatures(config, targetScopeLimitations)
               : config;

   if (targetScope === 'user') {
      assertGlobalHomeAccess(`installing ${editor} config into user scope`);
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
         targetScopeLimitations.hooks
      )
   ) {
      result.targetScopeLimitations = targetScopeLimitations;
   }

   // Handle global-only features (MCP for Windsurf/Codex, Prompts for Codex)
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
      result.globalChanges = globalChanges;
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
): Promise<GlobalChangesInfo | undefined> {
   const { mcpStrategy, promptsStrategy } = adapter.getStrategyBundle();

   // Check if this editor has any global-only features
   const hasMcpGlobalOnly = mcpStrategy?.isGlobalOnly?.() && Object.keys(editorConfig.mcp).length > 0,
         hasPromptsGlobalOnly = promptsStrategy?.isGlobalOnly?.() && editorConfig.prompts.length > 0;

   if (!hasMcpGlobalOnly && !hasPromptsGlobalOnly) {
      return undefined;
   }

   assertGlobalHomeAccess(`applying global-only ${adapter.name} configuration`);

   // Analyze what global changes are needed
   const changes = await analyzeGlobalChanges(adapter.name, editorConfig, mcpStrategy, promptsStrategy);

   if (changes.length === 0) {
      return undefined;
   }

   // Apply the changes (respecting skipGlobal and autoConfirmGlobal options)
   const globalResult = await applyGlobalChanges(changes, {
      skipGlobal: options?.skipGlobal,
      skipGlobalReason: options?.skipGlobalReason,
      autoConfirm: options?.autoConfirmGlobal,
      projectPath: projectRoot,
      dryRun: options?.dryRun,
   });

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

   return info;
}

/**
 * Install configuration to multiple editors.
 */
export async function installToEditors(
   editors: EditorName[],
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions,
): Promise<ApplyResult[]> {
   return pMap(editors, (editor) => installToEditor(editor, config, projectRoot, options), {
      concurrency: 2,
   });
}

/**
 * Install configuration to all detected editors, or specified editors if provided.
 */
export async function install(
   config: AiJsonConfig,
   projectRoot: string,
   options?: ApplyOptions & { editors?: EditorName[] },
): Promise<ApplyResult[]> {
   const editors = options?.editors ?? (await detectEditors(projectRoot));

   // If no editors detected and none specified, install to all
   const targetEditors = editors.length > 0 ? editors : getAvailableEditors();

   return installToEditors(targetEditors, config, projectRoot, options);
}
