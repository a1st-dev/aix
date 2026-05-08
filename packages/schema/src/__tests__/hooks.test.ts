import { describe, it, expect } from 'vitest';
import {
   hookActionSchema,
   hookEventSchema,
   hookMatcherSchema,
   hooksSchema,
} from '../hooks.js';

describe('hookEventSchema', () => {
   const newEvents = [
      'session_start',
      'session_end',
      'setup',
      'pre_prompt',
      'user_prompt_expansion',
      'pre_tool_use',
      'post_tool_use',
      'post_tool_use_failure',
      'post_tool_batch',
      'pre_tool_selection',
      'permission_request',
      'permission_denied',
      'pre_file_read',
      'post_file_read',
      'pre_file_write',
      'post_file_write',
      'pre_command',
      'post_command',
      'pre_mcp_tool',
      'post_mcp_tool',
      'pre_tab_file_read',
      'post_tab_file_edit',
      'pre_model_request',
      'post_model_response',
      'pre_response_chunk',
      'pre_agent',
      'post_agent',
      'post_response',
      'post_response_with_transcript',
      'agent_stop',
      'subagent_start',
      'subagent_stop',
      'subagent_idle',
      'pre_compact',
      'post_compact',
      'task_created',
      'task_completed',
      'worktree_setup',
      'worktree_remove',
      'instructions_loaded',
      'config_change',
      'cwd_changed',
      'file_changed',
      'notification',
      'elicitation',
      'elicitation_result',
      'error_occurred',
   ] as const;

   it.each(newEvents)('accepts %s', (event) => {
      expect(() => hookEventSchema.parse(event)).not.toThrow();
   });

   it('rejects an unknown event', () => {
      expect(() => hookEventSchema.parse('totally_made_up')).toThrow();
   });
});

describe('hookActionSchema', () => {
   it('accepts a minimal command action with no fields', () => {
      const parsed = hookActionSchema.parse({ command: 'echo hi' });

      expect(parsed.command).toBe('echo hi');
   });

   it('accepts every optional field', () => {
      const parsed = hookActionSchema.parse({
         type: 'http',
         command: 'echo hi',
         bash: 'echo hi',
         powershell: 'Write-Host hi',
         shell: 'powershell',
         timeout: 60,
         show_output: true,
         working_directory: '/tmp',
         cwd: '/tmp',
         env: { API_KEY: 'x' },
         async: true,
         async_rewake: true,
         if: 'tool=Bash',
         status_message: 'running',
         once: false,
         url: 'https://example.com/hook',
         headers: { Authorization: 'Bearer $T' },
         allowed_env_vars: ['T'],
         mcp_server: 'memory',
         mcp_tool: 'scan',
         mcp_input: { path: '${tool_input.file_path}' },
         prompt: 'Is this safe?',
         model: 'claude-haiku',
         description: 'demo',
         name: 'demo-hook',
         fail_closed: true,
         loop_limit: 5,
      });

      expect(parsed.type).toBe('http');
      expect(parsed.bash).toBe('echo hi');
      expect(parsed.fail_closed).toBe(true);
      expect(parsed.loop_limit).toBe(5);
      expect(parsed.headers?.Authorization).toBe('Bearer $T');
   });

   it('rejects an unknown action type', () => {
      expect(() => hookActionSchema.parse({ type: 'unknown', command: 'x' })).toThrow();
   });

   it('accepts loop_limit: null', () => {
      const parsed = hookActionSchema.parse({ command: 'x', loop_limit: null });

      expect(parsed.loop_limit).toBeNull();
   });
});

describe('hookMatcherSchema', () => {
   it('accepts sequential and description', () => {
      const parsed = hookMatcherSchema.parse({
         matcher: 'Bash',
         sequential: true,
         description: 'group of safety checks',
         hooks: [{ command: 'check.sh' }],
      });

      expect(parsed.sequential).toBe(true);
      expect(parsed.description).toBe('group of safety checks');
   });
});

describe('hooksSchema', () => {
   it('round-trips a representative config', () => {
      const config = {
         pre_tool_use: [
            {
               matcher: 'Bash',
               hooks: [{ command: 'echo pre' }],
            },
         ],
         notification: [
            {
               hooks: [{ type: 'http' as const, url: 'https://example.com/notify' }],
            },
         ],
      };

      const parsed = hooksSchema.parse(config);

      expect(parsed.pre_tool_use?.[0]?.hooks?.[0]?.command).toBe('echo pre');
      expect(parsed.notification?.[0]?.hooks?.[0]?.url).toBe('https://example.com/notify');
   });
});
