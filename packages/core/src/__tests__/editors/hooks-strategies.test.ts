import { describe, it, expect } from 'vitest';
import { CursorHooksStrategy } from '../../editors/strategies/cursor/hooks.js';
import { ClaudeCodeHooksStrategy } from '../../editors/strategies/claude-code/hooks.js';
import { WindsurfHooksStrategy } from '../../editors/strategies/windsurf/hooks.js';
import { CopilotHooksStrategy } from '../../editors/strategies/copilot/hooks.js';
import type { HooksConfig } from '@a1st/aix-schema';

describe('CursorHooksStrategy', () => {
   const strategy = new CursorHooksStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toBe(true);
   });

   it('returns hooks.json as config path', () => {
      expect(strategy.getConfigPath()).toBe('hooks.json');
   });

   it('maps pre_command to beforeShellExecution', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'echo pre' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution).toEqual([{ command: 'echo pre' }]);
   });

   it('maps all original events to Cursor names', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd1' }] }],
         post_command: [{ hooks: [{ command: 'cmd2' }] }],
         pre_mcp_tool: [{ hooks: [{ command: 'cmd3' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'cmd4' }] }],
         post_file_write: [{ hooks: [{ command: 'cmd5' }] }],
         pre_prompt: [{ hooks: [{ command: 'cmd6' }] }],
         agent_stop: [{ hooks: [{ command: 'cmd7' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution).toBeDefined();
      expect(output.hooks.afterShellExecution).toBeDefined();
      expect(output.hooks.beforeMCPExecution).toBeDefined();
      expect(output.hooks.afterMCPExecution).toBeDefined();
      expect(output.hooks.afterFileEdit).toBeDefined();
      expect(output.hooks.beforeSubmitPrompt).toBeDefined();
      expect(output.hooks.stop).toBeDefined();
   });

   it('maps new events: session_start, session_end, pre_tool_use, post_tool_use, pre_file_read', () => {
      const hooks: HooksConfig = {
         session_start: [{ hooks: [{ command: 'cmd1' }] }],
         session_end: [{ hooks: [{ command: 'cmd2' }] }],
         pre_tool_use: [{ hooks: [{ command: 'cmd3' }] }],
         post_tool_use: [{ hooks: [{ command: 'cmd4' }] }],
         pre_file_read: [{ hooks: [{ command: 'cmd5' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.sessionStart).toEqual([{ command: 'cmd1' }]);
      expect(output.hooks.sessionEnd).toEqual([{ command: 'cmd2' }]);
      expect(output.hooks.preToolUse).toEqual([{ command: 'cmd3' }]);
      expect(output.hooks.postToolUse).toEqual([{ command: 'cmd4' }]);
      expect(output.hooks.beforeReadFile).toEqual([{ command: 'cmd5' }]);
   });

   it('preserves matcher when present', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ matcher: 'Shell|Read', hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([{ command: 'cmd', matcher: 'Shell|Read' }]);
   });

   it('omits matcher when absent', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution[0].matcher).toBeUndefined();
   });

   it('includes timeout when specified', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd', timeout: 30 }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution[0].timeout).toBe(30);
   });

   it('reports unsupported events correctly', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
         post_file_read: [{ hooks: [{ command: 'cmd' }] }],
         pre_file_write: [{ hooks: [{ command: 'cmd' }] }],
      };

      const unsupported = strategy.getUnsupportedEvents(hooks);

      expect(unsupported).toContain('post_file_read');
      expect(unsupported).toContain('pre_file_write');
      expect(unsupported).not.toContain('pre_command');
   });

   it('skips unsupported events in output', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
         post_file_read: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution).toBeDefined();
      expect(Object.keys(output.hooks)).toHaveLength(1);
   });
});

describe('ClaudeCodeHooksStrategy', () => {
   const strategy = new ClaudeCodeHooksStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toBe(true);
   });

   it('returns settings.json as config path', () => {
      expect(strategy.getConfigPath()).toBe('settings.json');
   });

   it('maps session_start to SessionStart with matcher structure', () => {
      const hooks: HooksConfig = {
         session_start: [{ matcher: '.*', hooks: [{ command: 'echo start' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.SessionStart).toEqual([
         { matcher: '.*', hooks: [{ type: 'command', command: 'echo start' }] },
      ]);
   });

   it('maps pre_command to PreToolUse with Bash tool matcher', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'echo pre' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] },
      ]);
   });

   it('maps pre_file_read to PreToolUse with Read matcher', () => {
      const hooks: HooksConfig = {
         pre_file_read: [{ hooks: [{ command: 'echo read' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Read', hooks: [{ type: 'command', command: 'echo read' }] },
      ]);
   });

   it('maps pre_file_write to PreToolUse with Write|Edit matcher', () => {
      const hooks: HooksConfig = {
         pre_file_write: [{ hooks: [{ command: 'echo write' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'echo write' }] },
      ]);
   });

   it('maps pre_mcp_tool to PreToolUse with mcp__.* matcher', () => {
      const hooks: HooksConfig = {
         pre_mcp_tool: [{ hooks: [{ command: 'echo mcp' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'mcp__.*', hooks: [{ type: 'command', command: 'echo mcp' }] },
      ]);
   });

   it('accumulates multiple events into the same Claude Code event', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ matcher: '.*', hooks: [{ command: 'generic' }] }],
         pre_command: [{ hooks: [{ command: 'bash-specific' }] }],
         pre_file_read: [{ hooks: [{ command: 'read-specific' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toHaveLength(3);
      expect(output.hooks.PreToolUse[0].matcher).toBe('.*');
      expect(output.hooks.PreToolUse[0].hooks[0].command).toBe('generic');
      expect(output.hooks.PreToolUse[1].matcher).toBe('Bash');
      expect(output.hooks.PreToolUse[1].hooks[0].command).toBe('bash-specific');
      expect(output.hooks.PreToolUse[2].matcher).toBe('Read');
      expect(output.hooks.PreToolUse[2].hooks[0].command).toBe('read-specific');
   });

   it('maps post events with correct tool matchers', () => {
      const hooks: HooksConfig = {
         post_file_read: [{ hooks: [{ command: 'cmd1' }] }],
         post_file_write: [{ hooks: [{ command: 'cmd2' }] }],
         post_command: [{ hooks: [{ command: 'cmd3' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'cmd4' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse).toHaveLength(4);
      expect(output.hooks.PostToolUse[0].matcher).toBe('Read');
      expect(output.hooks.PostToolUse[1].matcher).toBe('Write|Edit');
      expect(output.hooks.PostToolUse[2].matcher).toBe('Bash');
      expect(output.hooks.PostToolUse[3].matcher).toBe('mcp__.*');
   });

   it('uses user matcher for pre_tool_use (generic event)', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ matcher: 'Write', hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse[0].matcher).toBe('Write');
   });

   it('uses empty string for pre_tool_use without matcher', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse[0].matcher).toBe('');
   });

   it('includes timeout when specified', () => {
      const hooks: HooksConfig = {
         session_start: [{ hooks: [{ command: 'cmd', timeout: 60 }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.SessionStart[0].hooks[0].timeout).toBe(60);
   });

   it('reports no unsupported events for all 14 schema events', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'c' }] }],
         post_tool_use: [{ hooks: [{ command: 'c' }] }],
         pre_file_read: [{ hooks: [{ command: 'c' }] }],
         post_file_read: [{ hooks: [{ command: 'c' }] }],
         pre_file_write: [{ hooks: [{ command: 'c' }] }],
         post_file_write: [{ hooks: [{ command: 'c' }] }],
         pre_command: [{ hooks: [{ command: 'c' }] }],
         post_command: [{ hooks: [{ command: 'c' }] }],
         pre_mcp_tool: [{ hooks: [{ command: 'c' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'c' }] }],
         pre_prompt: [{ hooks: [{ command: 'c' }] }],
         session_start: [{ hooks: [{ command: 'c' }] }],
         session_end: [{ hooks: [{ command: 'c' }] }],
         agent_stop: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([]);
   });
});

describe('WindsurfHooksStrategy', () => {
   const strategy = new WindsurfHooksStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toBe(true);
   });

   it('returns hooks.json as config path', () => {
      expect(strategy.getConfigPath()).toBe('hooks.json');
   });

   it('maps pre_command to pre_run_command', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'echo pre' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.pre_run_command).toEqual([{ command: 'echo pre' }]);
   });

   it('maps all supported events', () => {
      const hooks: HooksConfig = {
         pre_file_read: [{ hooks: [{ command: 'c1' }] }],
         post_file_read: [{ hooks: [{ command: 'c2' }] }],
         pre_file_write: [{ hooks: [{ command: 'c3' }] }],
         post_file_write: [{ hooks: [{ command: 'c4' }] }],
         pre_command: [{ hooks: [{ command: 'c5' }] }],
         post_command: [{ hooks: [{ command: 'c6' }] }],
         pre_mcp_tool: [{ hooks: [{ command: 'c7' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'c8' }] }],
         pre_prompt: [{ hooks: [{ command: 'c9' }] }],
         agent_stop: [{ hooks: [{ command: 'c10' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.pre_read_code).toBeDefined();
      expect(output.hooks.post_read_code).toBeDefined();
      expect(output.hooks.pre_write_code).toBeDefined();
      expect(output.hooks.post_write_code).toBeDefined();
      expect(output.hooks.pre_run_command).toBeDefined();
      expect(output.hooks.post_run_command).toBeDefined();
      expect(output.hooks.pre_mcp_tool_use).toBeDefined();
      expect(output.hooks.post_mcp_tool_use).toBeDefined();
      expect(output.hooks.pre_user_prompt).toBeDefined();
      expect(output.hooks.post_cascade_response).toBeDefined();
   });

   it('includes show_output and working_directory when specified', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd', show_output: true, working_directory: '/tmp' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.pre_run_command[0]).toEqual({
         command: 'cmd',
         show_output: true,
         working_directory: '/tmp',
      });
   });

   it('reports unsupported events correctly', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
         session_start: [{ hooks: [{ command: 'cmd' }] }],
         pre_tool_use: [{ hooks: [{ command: 'cmd' }] }],
      };

      const unsupported = strategy.getUnsupportedEvents(hooks);

      expect(unsupported).toContain('session_start');
      expect(unsupported).toContain('pre_tool_use');
      expect(unsupported).not.toContain('pre_command');
   });
});

describe('CopilotHooksStrategy', () => {
   const strategy = new CopilotHooksStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toBe(true);
   });

   it('returns ../.github/hooks/hooks.json as config path', () => {
      expect(strategy.getConfigPath()).toBe('../.github/hooks/hooks.json');
   });

   it('maps session_start to SessionStart with matcher structure', () => {
      const hooks: HooksConfig = {
         session_start: [{ matcher: '.*', hooks: [{ command: 'echo start' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.SessionStart).toEqual([
         { matcher: '.*', hooks: [{ type: 'command', command: 'echo start' }] },
      ]);
   });

   it('maps pre_command to PreToolUse with Bash tool matcher', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'echo pre' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] },
      ]);
   });

   it('maps pre_file_read to PreToolUse with Read matcher', () => {
      const hooks: HooksConfig = {
         pre_file_read: [{ hooks: [{ command: 'echo read' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Read', hooks: [{ type: 'command', command: 'echo read' }] },
      ]);
   });

   it('maps pre_file_write to PreToolUse with Write|Edit matcher', () => {
      const hooks: HooksConfig = {
         pre_file_write: [{ hooks: [{ command: 'echo write' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'echo write' }] },
      ]);
   });

   it('maps pre_mcp_tool to PreToolUse with mcp__.* matcher', () => {
      const hooks: HooksConfig = {
         pre_mcp_tool: [{ hooks: [{ command: 'echo mcp' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toEqual([
         { matcher: 'mcp__.*', hooks: [{ type: 'command', command: 'echo mcp' }] },
      ]);
   });

   it('accumulates multiple events into the same GitHub Copilot event', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ matcher: '.*', hooks: [{ command: 'generic' }] }],
         pre_command: [{ hooks: [{ command: 'bash-specific' }] }],
         pre_file_read: [{ hooks: [{ command: 'read-specific' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toHaveLength(3);
      expect(output.hooks.PreToolUse[0].matcher).toBe('.*');
      expect(output.hooks.PreToolUse[0].hooks[0].command).toBe('generic');
      expect(output.hooks.PreToolUse[1].matcher).toBe('Bash');
      expect(output.hooks.PreToolUse[1].hooks[0].command).toBe('bash-specific');
      expect(output.hooks.PreToolUse[2].matcher).toBe('Read');
      expect(output.hooks.PreToolUse[2].hooks[0].command).toBe('read-specific');
   });

   it('maps post events with correct tool matchers', () => {
      const hooks: HooksConfig = {
         post_file_read: [{ hooks: [{ command: 'cmd1' }] }],
         post_file_write: [{ hooks: [{ command: 'cmd2' }] }],
         post_command: [{ hooks: [{ command: 'cmd3' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'cmd4' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse).toHaveLength(4);
      expect(output.hooks.PostToolUse[0].matcher).toBe('Read');
      expect(output.hooks.PostToolUse[1].matcher).toBe('Write|Edit');
      expect(output.hooks.PostToolUse[2].matcher).toBe('Bash');
      expect(output.hooks.PostToolUse[3].matcher).toBe('mcp__.*');
   });

   it('uses user matcher for pre_tool_use (generic event)', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ matcher: 'Write', hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse[0].matcher).toBe('Write');
   });

   it('uses empty string for pre_tool_use without matcher', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse[0].matcher).toBe('');
   });

   it('includes timeout when specified', () => {
      const hooks: HooksConfig = {
         session_start: [{ hooks: [{ command: 'cmd', timeout: 60 }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.SessionStart[0].hooks[0].timeout).toBe(60);
   });

   it('maps pre_prompt to UserPromptSubmit', () => {
      const hooks: HooksConfig = {
         pre_prompt: [{ hooks: [{ command: 'echo prompt' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.UserPromptSubmit).toEqual([
         { matcher: '', hooks: [{ type: 'command', command: 'echo prompt' }] },
      ]);
   });

   it('maps agent_stop to Stop', () => {
      const hooks: HooksConfig = {
         agent_stop: [{ hooks: [{ command: 'echo stop' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.Stop).toEqual([
         { matcher: '', hooks: [{ type: 'command', command: 'echo stop' }] },
      ]);
   });

   it('reports session_end as unsupported', () => {
      const hooks: HooksConfig = {
         session_end: [{ hooks: [{ command: 'cmd' }] }],
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
      };

      const unsupported = strategy.getUnsupportedEvents(hooks);

      expect(unsupported).toContain('session_end');
      expect(unsupported).not.toContain('pre_command');
   });

   it('reports supported events correctly for all 13 except session_end', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'c' }] }],
         post_tool_use: [{ hooks: [{ command: 'c' }] }],
         pre_file_read: [{ hooks: [{ command: 'c' }] }],
         post_file_read: [{ hooks: [{ command: 'c' }] }],
         pre_file_write: [{ hooks: [{ command: 'c' }] }],
         post_file_write: [{ hooks: [{ command: 'c' }] }],
         pre_command: [{ hooks: [{ command: 'c' }] }],
         post_command: [{ hooks: [{ command: 'c' }] }],
         pre_mcp_tool: [{ hooks: [{ command: 'c' }] }],
         post_mcp_tool: [{ hooks: [{ command: 'c' }] }],
         pre_prompt: [{ hooks: [{ command: 'c' }] }],
         session_start: [{ hooks: [{ command: 'c' }] }],
         agent_stop: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([]);
   });

   it('skips session_end in output', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
         session_end: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse).toBeDefined();
      expect(Object.keys(output.hooks)).toHaveLength(1);
   });
});
