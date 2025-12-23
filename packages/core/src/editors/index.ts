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
} from './types.js';

export {
   BaseEditorAdapter,
   WindsurfAdapter,
   CursorAdapter,
   ClaudeCodeAdapter,
   VSCodeAdapter,
   ZedAdapter,
   CodexAdapter,
} from './adapters/index.js';

export {
   getAdapter,
   getAvailableEditors,
   detectEditors,
   installToEditor,
   installToEditors,
   install,
} from './install.js';

export { importFromEditor, getGlobalConfigPath } from './import.js';
export type { ImportResult } from './import.js';
