import { describe, it, expect } from 'vitest';
import { CursorHooksStrategy } from '../../editors/strategies/cursor/hooks.js';
import { ClaudeCodeHooksStrategy } from '../../editors/strategies/claude-code/hooks.js';
import { WindsurfHooksStrategy } from '../../editors/strategies/windsurf/hooks.js';
import { CopilotHooksStrategy } from '../../editors/strategies/copilot/hooks.js';
import { GeminiHooksStrategy } from '../../editors/strategies/gemini/hooks.js';
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

   it('wraps the output with version: 1', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.version).toBe(1);
      expect(output.hooks).toBeDefined();
   });

   it('maps the SP-03 events to their Cursor names', () => {
      const hooks: HooksConfig = {
         post_tool_use_failure: [{ hooks: [{ command: 'c1' }] }],
         subagent_start: [{ hooks: [{ command: 'c2' }] }],
         subagent_stop: [{ hooks: [{ command: 'c3' }] }],
         pre_compact: [{ hooks: [{ command: 'c4' }] }],
         post_response: [{ hooks: [{ command: 'c5' }] }],
         pre_response_chunk: [{ hooks: [{ command: 'c6' }] }],
         pre_tab_file_read: [{ hooks: [{ command: 'c7' }] }],
         post_tab_file_edit: [{ hooks: [{ command: 'c8' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.postToolUseFailure[0].command).toBe('c1');
      expect(output.hooks.subagentStart[0].command).toBe('c2');
      expect(output.hooks.subagentStop[0].command).toBe('c3');
      expect(output.hooks.preCompact[0].command).toBe('c4');
      expect(output.hooks.afterAgentResponse[0].command).toBe('c5');
      expect(output.hooks.afterAgentThought[0].command).toBe('c6');
      expect(output.hooks.beforeTabFileRead[0].command).toBe('c7');
      expect(output.hooks.afterTabFileEdit[0].command).toBe('c8');
   });

   it('emits a prompt-type hook with model and timeout', () => {
      const hooks: HooksConfig = {
         pre_command: [
            { hooks: [{ type: 'prompt', prompt: 'safe?', model: 'fast', timeout: 10 }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.beforeShellExecution[0]).toEqual({
         type: 'prompt',
         prompt: 'safe?',
         model: 'fast',
         timeout: 10,
      });
   });

   it('passes through fail_closed and loop_limit when set', () => {
      const hooks: HooksConfig = {
         agent_stop: [
            { hooks: [{ command: 'cmd', fail_closed: true, loop_limit: 5 }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.stop[0]).toEqual({
         command: 'cmd',
         failClosed: true,
         loop_limit: 5,
      });
   });

   it('maps subagent_start and subagent_stop', () => {
      const hooks: HooksConfig = {
         subagent_start: [{ hooks: [{ command: 'sub-start.sh' }] }],
         subagent_stop: [{ hooks: [{ command: 'sub-stop.sh' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.subagentStart).toEqual([{ command: 'sub-start.sh' }]);
      expect(output.hooks.subagentStop).toEqual([{ command: 'sub-stop.sh' }]);
   });

   it('maps permission_request to preToolUse (Cursor models permission via preToolUse)', () => {
      const hooks: HooksConfig = {
         permission_request: [{ hooks: [{ command: 'check.sh' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([{ command: 'check.sh' }]);
   });

   it('flags transcript_path as unsupported on post_response_with_transcript', () => {
      const hooks: HooksConfig = {
         post_response_with_transcript: [
            { hooks: [{ command: 'cmd' }] },
         ],
      };

      const fields = strategy.getUnsupportedFields(hooks);

      expect(fields).toEqual([
         {
            event: 'post_response_with_transcript',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'transcript_path' ],
         },
      ]);
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

   it('reports no unsupported events for all schema events', () => {
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
         pre_compact: [{ hooks: [{ command: 'c' }] }],
         post_compact: [{ hooks: [{ command: 'c' }] }],
         subagent_start: [{ hooks: [{ command: 'c' }] }],
         subagent_stop: [{ hooks: [{ command: 'c' }] }],
         task_created: [{ hooks: [{ command: 'c' }] }],
         task_completed: [{ hooks: [{ command: 'c' }] }],
         worktree_setup: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([]);
   });

   it('maps new generic events correctly', () => {
      const hooks: HooksConfig = {
         pre_compact: [{ hooks: [{ command: 'c1' }] }],
         post_compact: [{ hooks: [{ command: 'c2' }] }],
         subagent_start: [{ hooks: [{ command: 'c3' }] }],
         subagent_stop: [{ hooks: [{ command: 'c4' }] }],
         task_created: [{ hooks: [{ command: 'c5' }] }],
         task_completed: [{ hooks: [{ command: 'c6' }] }],
         worktree_setup: [{ hooks: [{ command: 'c7' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreCompact).toBeDefined();
      expect(output.hooks.PostCompact).toBeDefined();
      expect(output.hooks.SubagentStart).toBeDefined();
      expect(output.hooks.SubagentStop).toBeDefined();
      expect(output.hooks.TaskCreated).toBeDefined();
      expect(output.hooks.TaskCompleted).toBeDefined();
      expect(output.hooks.WorktreeCreate).toBeDefined();
   });

   it('maps the full extended event set introduced by SP-02', () => {
      const hooks: HooksConfig = {
         setup: [{ hooks: [{ command: 'c1' }] }],
         user_prompt_expansion: [{ hooks: [{ command: 'c2' }] }],
         permission_request: [{ hooks: [{ command: 'c3' }] }],
         permission_denied: [{ hooks: [{ command: 'c4' }] }],
         post_tool_use_failure: [{ hooks: [{ command: 'c5' }] }],
         post_tool_batch: [{ hooks: [{ command: 'c6' }] }],
         notification: [{ hooks: [{ command: 'c7' }] }],
         subagent_idle: [{ hooks: [{ command: 'c8' }] }],
         instructions_loaded: [{ hooks: [{ command: 'c9' }] }],
         config_change: [{ hooks: [{ command: 'c10' }] }],
         cwd_changed: [{ hooks: [{ command: 'c11' }] }],
         file_changed: [{ hooks: [{ command: 'c12' }] }],
         worktree_remove: [{ hooks: [{ command: 'c13' }] }],
         elicitation: [{ hooks: [{ command: 'c14' }] }],
         elicitation_result: [{ hooks: [{ command: 'c15' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.Setup).toBeDefined();
      expect(output.hooks.UserPromptExpansion).toBeDefined();
      expect(output.hooks.PermissionRequest).toBeDefined();
      expect(output.hooks.PermissionDenied).toBeDefined();
      expect(output.hooks.PostToolUseFailure).toBeDefined();
      expect(output.hooks.PostToolBatch).toBeDefined();
      expect(output.hooks.Notification).toBeDefined();
      expect(output.hooks.TeammateIdle).toBeDefined();
      expect(output.hooks.InstructionsLoaded).toBeDefined();
      expect(output.hooks.ConfigChange).toBeDefined();
      expect(output.hooks.CwdChanged).toBeDefined();
      expect(output.hooks.FileChanged).toBeDefined();
      expect(output.hooks.WorktreeRemove).toBeDefined();
      expect(output.hooks.Elicitation).toBeDefined();
      expect(output.hooks.ElicitationResult).toBeDefined();
   });

   it('reports error_occurred as an unsupported event (StopFailure has narrower semantics)', () => {
      const hooks: HooksConfig = {
         error_occurred: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([ 'error_occurred' ]);
   });

   it('emits an http hook entry with headers and allowed_env_vars', () => {
      const hooks: HooksConfig = {
         post_tool_use: [
            {
               hooks: [{
                  type: 'http',
                  url: 'https://example.com/notify',
                  headers: { Authorization: 'Bearer $T' },
                  allowed_env_vars: [ 'T' ],
                  timeout: 5,
               }],
            },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse[0].hooks[0]).toEqual({
         type: 'http',
         url: 'https://example.com/notify',
         headers: { Authorization: 'Bearer $T' },
         allowedEnvVars: [ 'T' ],
         timeout: 5,
      });
   });

   it('emits an mcp_tool hook entry with input substitution preserved', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [
            {
               hooks: [{
                  type: 'mcp_tool',
                  mcp_server: 'memory',
                  mcp_tool: 'scan',
                  mcp_input: { path: '${tool_input.file_path}' },
               }],
            },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PreToolUse[0].hooks[0]).toEqual({
         type: 'mcp_tool',
         server: 'memory',
         tool: 'scan',
         input: { path: '${tool_input.file_path}' },
      });
   });

   it('emits prompt and agent hook entries with model override', () => {
      const hooks: HooksConfig = {
         post_tool_use: [
            {
               hooks: [
                  { type: 'prompt', prompt: 'is this safe?', model: 'fast', timeout: 30 },
                  { type: 'agent', prompt: 'investigate', model: 'sonnet' },
               ],
            },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse[0].hooks).toEqual([
         { type: 'prompt', prompt: 'is this safe?', model: 'fast', timeout: 30 },
         { type: 'agent', prompt: 'investigate', model: 'sonnet' },
      ]);
   });

   it('emits async, asyncRewake, shell, if, statusMessage, and once on a command hook', () => {
      const hooks: HooksConfig = {
         post_tool_use: [
            {
               hooks: [{
                  command: 'cleanup.sh',
                  async: true,
                  async_rewake: true,
                  shell: 'bash',
                  if: 'tool=Bash',
                  status_message: 'cleaning',
                  once: true,
               }],
            },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse[0].hooks[0]).toEqual({
         type: 'command',
         command: 'cleanup.sh',
         async: true,
         asyncRewake: true,
         shell: 'bash',
         if: 'tool=Bash',
         statusMessage: 'cleaning',
         once: true,
      });
   });

   it('expands a bash + powershell action into two entries with shell selectors', () => {
      const hooks: HooksConfig = {
         post_tool_use: [
            { hooks: [{ bash: 'echo bash', powershell: 'Write-Host ps' }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse[0].hooks).toEqual([
         { type: 'command', command: 'echo bash', shell: 'bash' },
         { type: 'command', command: 'Write-Host ps', shell: 'powershell' },
      ]);
   });

   it('honors shell: bash when only bash field is also present (suppresses powershell)', () => {
      const hooks: HooksConfig = {
         post_tool_use: [
            { hooks: [{ bash: 'echo b', powershell: 'Write-Host p', shell: 'bash' }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.PostToolUse[0].hooks).toEqual([
         { type: 'command', command: 'echo b', shell: 'bash' },
      ]);
   });

   it('reports unsupported fields per action via getUnsupportedFields', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [
            {
               hooks: [{
                  command: 'cmd',
                  show_output: true,
                  working_directory: '/tmp',
                  fail_closed: true,
               }],
            },
         ],
      };

      const fields = strategy.getUnsupportedFields(hooks);

      expect(fields).toEqual([
         {
            event: 'pre_tool_use',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'show_output', 'working_directory', 'fail_closed' ],
         },
      ]);
   });

   it('exposes the aix and native event names for the matrix', () => {
      const aixEvents = strategy.getSupportedEvents();

      expect(aixEvents).toContain('setup');
      expect(aixEvents).toContain('elicitation_result');

      const native = strategy.getNativeEventNames();

      expect(native).toContain('Setup');
      expect(native).toContain('TeammateIdle');
      expect(native).not.toContain('StopFailure');
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
         worktree_setup: [{ hooks: [{ command: 'c11' }] }],
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
      expect(output.hooks.post_setup_worktree).toBeDefined();
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

   it('maps post_response_with_transcript to the transcript-aware Windsurf event', () => {
      const hooks: HooksConfig = {
         post_response_with_transcript: [{ hooks: [{ command: 'transcribe.sh' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.post_cascade_response_with_transcript).toEqual([
         { command: 'transcribe.sh' },
      ]);
   });

   it('maps post_response to post_cascade_response (alias for agent_stop)', () => {
      const hooks: HooksConfig = {
         post_response: [{ hooks: [{ command: 'log.sh' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.post_cascade_response).toEqual([{ command: 'log.sh' }]);
   });

   it('emits both command and powershell when both supplied', () => {
      const hooks: HooksConfig = {
         pre_command: [
            { hooks: [{ bash: 'echo bash', powershell: 'Write-Host ps' }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.pre_run_command[0]).toEqual({
         command: 'echo bash',
         powershell: 'Write-Host ps',
      });
   });

   it('reports env as an unsupported field', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd', env: { K: 'V' }, timeout: 30 }] }],
      };

      const fields = strategy.getUnsupportedFields(hooks);

      expect(fields).toEqual([
         {
            event: 'pre_command',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'env', 'timeout' ],
         },
      ]);
   });

   it('exposes the new transcript-aware native event for the matrix', () => {
      const native = strategy.getNativeEventNames();

      expect(native).toContain('post_cascade_response_with_transcript');
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

   it('wraps the output with version: 1', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.version).toBe(1);
      expect(output.hooks).toBeDefined();
   });

   it('maps session_start to sessionStart with bash command and matcher', () => {
      const hooks: HooksConfig = {
         session_start: [{ matcher: '.*', hooks: [{ command: 'echo start' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.sessionStart).toEqual([
         { matcher: '.*', hooks: [{ type: 'command', bash: 'echo start' }] },
      ]);
   });

   it('maps pre_command to preToolUse with bash|powershell tool matcher', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'echo pre' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([
         { matcher: 'bash|powershell', hooks: [{ type: 'command', bash: 'echo pre' }] },
      ]);
   });

   it('maps pre_file_read to preToolUse with view matcher', () => {
      const hooks: HooksConfig = {
         pre_file_read: [{ hooks: [{ command: 'echo read' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([
         { matcher: 'view', hooks: [{ type: 'command', bash: 'echo read' }] },
      ]);
   });

   it('maps pre_file_write to preToolUse with create|edit matcher', () => {
      const hooks: HooksConfig = {
         pre_file_write: [{ hooks: [{ command: 'echo write' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([
         { matcher: 'create|edit', hooks: [{ type: 'command', bash: 'echo write' }] },
      ]);
   });

   it('maps pre_mcp_tool to preToolUse with mcp__.* matcher', () => {
      const hooks: HooksConfig = {
         pre_mcp_tool: [{ hooks: [{ command: 'echo mcp' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toEqual([
         { matcher: 'mcp__.*', hooks: [{ type: 'command', bash: 'echo mcp' }] },
      ]);
   });

   it('emits powershell field when shell is powershell', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'Write-Host hi', shell: 'powershell' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse[0].hooks[0]).toEqual({
         type: 'command',
         powershell: 'Write-Host hi',
      });
   });

   it('emits both bash and powershell fields when both supplied', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ bash: 'echo bash', powershell: 'Write-Host ps' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse[0].hooks[0]).toEqual({
         type: 'command',
         bash: 'echo bash',
         powershell: 'Write-Host ps',
      });
   });

   it('emits cwd, env, and timeoutSec', () => {
      const hooks: HooksConfig = {
         pre_command: [
            { hooks: [{ command: 'cmd', cwd: '/repo', env: { K: 'V' }, timeout: 45 }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse[0].hooks[0]).toEqual({
         type: 'command',
         bash: 'cmd',
         cwd: '/repo',
         env: { K: 'V' },
         timeoutSec: 45,
      });
   });

   it('falls back from working_directory to cwd', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd', working_directory: '/repo' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse[0].hooks[0].cwd).toBe('/repo');
   });

   it('maps pre_prompt to userPromptSubmitted', () => {
      const hooks: HooksConfig = {
         pre_prompt: [{ hooks: [{ command: 'echo prompt' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.userPromptSubmitted).toEqual([
         { matcher: '', hooks: [{ type: 'command', bash: 'echo prompt' }] },
      ]);
   });

   it('maps agent_stop to agentStop (not stop)', () => {
      const hooks: HooksConfig = {
         agent_stop: [{ hooks: [{ command: 'echo stop' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.agentStop).toEqual([
         { matcher: '', hooks: [{ type: 'command', bash: 'echo stop' }] },
      ]);
      expect(output.hooks.stop).toBeUndefined();
   });

   it('maps the SP-04 events: errorOccurred, notification, permissionRequest, postToolUseFailure', () => {
      const hooks: HooksConfig = {
         error_occurred: [{ hooks: [{ command: 'c1' }] }],
         notification: [{ hooks: [{ command: 'c2' }] }],
         permission_request: [{ hooks: [{ command: 'c3' }] }],
         post_tool_use_failure: [{ hooks: [{ command: 'c4' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.errorOccurred).toBeDefined();
      expect(output.hooks.notification).toBeDefined();
      expect(output.hooks.permissionRequest).toBeDefined();
      expect(output.hooks.postToolUseFailure).toBeDefined();
   });

   it('emits a prompt-type hook only on session_start', () => {
      const hooks: HooksConfig = {
         session_start: [
            { hooks: [{ type: 'prompt', prompt: 'introduce yourself' }] },
         ],
         post_tool_use: [
            { hooks: [{ type: 'prompt', prompt: 'should not appear' }] },
         ],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.sessionStart[0].hooks[0]).toEqual({
         type: 'prompt',
         prompt: 'introduce yourself',
      });
      expect(output.hooks.postToolUse).toBeUndefined();
   });

   it('reports supported events correctly for all schema events Copilot maps', () => {
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
         pre_compact: [{ hooks: [{ command: 'c' }] }],
         subagent_start: [{ hooks: [{ command: 'c' }] }],
         subagent_stop: [{ hooks: [{ command: 'c' }] }],
         post_tool_use_failure: [{ hooks: [{ command: 'c' }] }],
         permission_request: [{ hooks: [{ command: 'c' }] }],
         notification: [{ hooks: [{ command: 'c' }] }],
         error_occurred: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([]);
   });

   it('skips unsupported in output', () => {
      const hooks: HooksConfig = {
         pre_command: [{ hooks: [{ command: 'cmd' }] }],
         task_created: [{ hooks: [{ command: 'cmd' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.preToolUse).toBeDefined();
      expect(Object.keys(output.hooks)).toHaveLength(1);
   });

   it('reports unsupported fields including async and prompt outside session_start', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [
            { hooks: [{ command: 'cmd', async: true, fail_closed: true }] },
         ],
         post_tool_use: [
            { hooks: [{ type: 'prompt', prompt: 'p' }] },
         ],
      };

      const fields = strategy.getUnsupportedFields(hooks);

      expect(fields).toEqual([
         {
            event: 'pre_tool_use',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'async', 'fail_closed' ],
         },
         {
            event: 'post_tool_use',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'prompt' ],
         },
      ]);
   });

   it('exposes the new native event names for the matrix', () => {
      const native = strategy.getNativeEventNames();

      expect(native).toContain('agentStop');
      expect(native).toContain('errorOccurred');
      expect(native).toContain('notification');
      expect(native).toContain('permissionRequest');
      expect(native).toContain('postToolUseFailure');
      expect(native).not.toContain('stop');
   });
});

describe('GeminiHooksStrategy', () => {
   const strategy = new GeminiHooksStrategy();

   it('reports itself as supported', () => {
      expect(strategy.isSupported()).toBe(true);
   });

   it('returns settings.json as config path', () => {
      expect(strategy.getConfigPath()).toBe('settings.json');
   });

   it('maps each documented Gemini event', () => {
      const hooks: HooksConfig = {
         session_start: [{ hooks: [{ command: 'c1' }] }],
         session_end: [{ hooks: [{ command: 'c2' }] }],
         pre_agent: [{ hooks: [{ command: 'c3' }] }],
         post_agent: [{ hooks: [{ command: 'c4' }] }],
         pre_model_request: [{ hooks: [{ command: 'c5' }] }],
         post_model_response: [{ hooks: [{ command: 'c6' }] }],
         pre_tool_selection: [{ hooks: [{ command: 'c7' }] }],
         pre_tool_use: [{ hooks: [{ command: 'c8' }] }],
         post_tool_use: [{ hooks: [{ command: 'c9' }] }],
         pre_compact: [{ hooks: [{ command: 'c10' }] }],
         notification: [{ hooks: [{ command: 'c11' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.SessionStart).toBeDefined();
      expect(output.hooks.SessionEnd).toBeDefined();
      expect(output.hooks.BeforeAgent).toBeDefined();
      expect(output.hooks.AfterAgent).toBeDefined();
      expect(output.hooks.BeforeModel).toBeDefined();
      expect(output.hooks.AfterModel).toBeDefined();
      expect(output.hooks.BeforeToolSelection).toBeDefined();
      expect(output.hooks.BeforeTool).toBeDefined();
      expect(output.hooks.AfterTool).toBeDefined();
      expect(output.hooks.PreCompress).toBeDefined();
      expect(output.hooks.Notification).toBeDefined();
   });

   it('converts aix seconds to Gemini milliseconds', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'check.sh', timeout: 60 }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.BeforeTool[0].hooks[0].timeout).toBe(60_000);
   });

   it('promotes bash to command when no command field is present', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ bash: 'echo hi' }] }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.BeforeTool[0].hooks[0].command).toBe('echo hi');
   });

   it('preserves matcher and sequential on the group', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{
            matcher: 'read_.*',
            sequential: true,
            hooks: [{ command: 'check.sh', name: 'safety', description: 'pre-tool guard' }],
         }],
      };

      const output = JSON.parse(strategy.formatConfig(hooks));

      expect(output.hooks.BeforeTool[0]).toEqual({
         matcher: 'read_.*',
         sequential: true,
         hooks: [{
            type: 'command',
            command: 'check.sh',
            name: 'safety',
            description: 'pre-tool guard',
         }],
      });
   });

   it('reports unsupported fields like env, fail_closed, and prompt', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{
            hooks: [{ command: 'cmd', env: { K: 'V' }, fail_closed: true, prompt: 'p' }],
         }],
      };

      const fields = strategy.getUnsupportedFields(hooks);

      expect(fields).toEqual([
         {
            event: 'pre_tool_use',
            matcherIndex: 0,
            actionIndex: 0,
            fields: [ 'env', 'fail_closed', 'prompt' ],
         },
      ]);
   });

   it('reports unsupported events for non-Gemini events', () => {
      const hooks: HooksConfig = {
         pre_tool_use: [{ hooks: [{ command: 'c' }] }],
         worktree_setup: [{ hooks: [{ command: 'c' }] }],
      };

      expect(strategy.getUnsupportedEvents(hooks)).toEqual([ 'worktree_setup' ]);
   });

   it('exposes the Gemini native event names for the matrix', () => {
      const native = strategy.getNativeEventNames();

      expect(native).toEqual([
         'AfterAgent',
         'AfterModel',
         'AfterTool',
         'BeforeAgent',
         'BeforeModel',
         'BeforeTool',
         'BeforeToolSelection',
         'Notification',
         'PreCompress',
         'SessionEnd',
         'SessionStart',
      ]);
   });
});
