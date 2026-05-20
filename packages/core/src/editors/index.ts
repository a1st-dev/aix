export type {
   EditorName,
   EditorAdapter,
   EditorConfig,
   EditorRule,
   ApplyOptions,
   ApplyResult,
   FileChange,
   FileChangeCategory,
   UnsupportedFeatures,
   TargetScopeLimitations,
} from './types.js';

export {
   BaseEditorAdapter,
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   CopilotAdapter,
   ZedAdapter,
   CodexAdapter,
   GeminiAdapter,
   OpenCodeAdapter,
} from './adapters/index.js';

export {
   getAdapter,
   getAvailableEditors,
   detectEditors,
   installToEditor,
   installToEditors,
   install,
} from './install.js';

export {
   removeMcpFromEditor,
   removeMcpFromEditors,
} from './remove.js';
export type {
   RemoveMcpFromEditorResult,
} from './remove.js';

export {
   importFromEditor,
   getGlobalConfigPath,
   normalizeEditorImport,
   buildConfigFromEditorImport,
} from './import.js';
export type {
   ImportResult,
   ImportOptions,
   ImportReadScope,
   NormalizedEditorImport,
   NormalizedImportedRule,
   NormalizedImportedPrompt,
   NormalizedImportedSkill,
} from './import.js';
