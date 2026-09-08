export type {
   RulesStrategy,
   McpStrategy,
   SkillsStrategy,
   PromptsStrategy,
   AgentsStrategy,
   HooksStrategy,
   NativeSkillsConfig,
   UnsupportedHookField,
} from './types.js';

// Shared strategies (used by multiple editors)
export {
   NativeSkillsStrategy,
   PointerSkillsStrategy,
   StandardMcpStrategy,
   NoMcpStrategy,
   NoPromptsStrategy,
   NoHooksStrategy,
   MarkdownAgentsStrategy,
   NoAgentsStrategy,
   GlobalMcpStrategy,
   hasHooksConfigPath,
   resolveHooksConfigPath,
} from './shared/index.js';

// Editor-specific strategies
export {
   WindsurfRulesStrategy,
   WindsurfPromptsStrategy,
   WindsurfMcpStrategy,
   WindsurfHooksStrategy,
} from './windsurf/index.js';
export { CursorRulesStrategy, CursorPromptsStrategy, CursorHooksStrategy } from './cursor/index.js';
export {
   ClaudeCodeRulesStrategy,
   ClaudeCodeMcpStrategy,
   ClaudeCodePromptsStrategy,
   ClaudeCodeHooksStrategy,
} from './claude-code/index.js';
export {
   CopilotRulesStrategy,
   CopilotMcpStrategy,
   CopilotPromptsStrategy,
   CopilotHooksStrategy,
} from './copilot/index.js';
export { ZedRulesStrategy, ZedMcpStrategy, ZedPromptsStrategy } from './zed/index.js';
export { CodexRulesStrategy, CodexPromptsStrategy, CodexMcpStrategy, CodexHooksStrategy } from './codex/index.js';
export {
   AntigravityRulesStrategy,
   AntigravityMcpStrategy,
   AntigravityPromptsStrategy,
   AntigravityHooksStrategy,
} from './antigravity/index.js';
