export type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   NativeSkillsConfig,
} from './types.js';

// Shared strategies (used by multiple editors)
export {
   NativeSkillsStrategy,
   PointerSkillsStrategy,
   StandardMcpStrategy,
   NoMcpStrategy,
   NoPromptsStrategy,
   GlobalMcpStrategy,
} from './shared/index.js';

// Editor-specific strategies
export {
   WindsurfRulesStrategy,
   WindsurfPromptsStrategy,
   WindsurfMcpStrategy,
} from './windsurf/index.js';
export { CursorRulesStrategy, CursorPromptsStrategy } from './cursor/index.js';
export {
   ClaudeCodeRulesStrategy,
   ClaudeCodeMcpStrategy,
   ClaudeCodePromptsStrategy,
} from './claude-code/index.js';
export { CopilotRulesStrategy, CopilotMcpStrategy, CopilotPromptsStrategy } from './copilot/index.js';
export { ZedRulesStrategy, ZedMcpStrategy, ZedPromptsStrategy } from './zed/index.js';
export { CodexRulesStrategy, CodexPromptsStrategy, CodexMcpStrategy } from './codex/index.js';
