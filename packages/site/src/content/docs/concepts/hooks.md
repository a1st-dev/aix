---
slug: concepts/hooks
sidebar:
   order: 5
title: Hooks
description: Trigger scripts on AI lifecycle events.
---

**Hooks** allow you to run scripts or commands in response to AI agent events. This is useful for:

- Logging agent activity
- Running security checks before tool use
- Setting up environment context when a session starts
- Cleaning up resources when a session ends

## Usage

Define hooks in `ai.json`:

```json
{
   "hooks": {
      "session_start": [
         {
            "matcher": ".*",
            "hooks": [
               {
                  "command": "./scripts/init-session.sh",
                  "show_output": true
               }
            ]
         }
      ],
      "pre_tool_use": [
         {
            "matcher": "write_file",
            "hooks": [
               {
                  "command": "echo 'AI is writing to a file...'"
               }
            ]
         }
      ]
   }
}
```

## Hook Events

| Event             | Description                                   |
| ----------------- | --------------------------------------------- |
| `session_start`   | Triggered when a new chat session begins.     |
| `session_end`     | Triggered when a session ends.                |
| `agent_stop`      | Triggered when the user interrupts the agent. |
| `pre_tool_use`    | Before the agent executes a tool.             |
| `post_tool_use`   | After tool execution completes.               |
| `pre_file_read`   | Before reading a file.                        |
| `post_file_read`  | After reading a file.                         |
| `pre_file_write`  | Before writing to a file.                     |
| `post_file_write` | After writing to a file.                      |
| `pre_command`     | Before executing a shell command.             |
| `post_command`    | After executing a shell command.              |
| `pre_mcp_tool`    | Before executing an MCP tool.                 |
| `post_mcp_tool`   | After MCP tool execution completes.           |
| `pre_prompt`      | Before submitting a prompt.                   |

## Editor Support

Hooks rely on the underlying editor's support for event callbacks.

- **Claude Code**: Supports all hook events. Written to `.claude/settings.json`.
- **Cursor**: Supports `pre_tool_use`, `post_tool_use`, `pre_file_read`, `pre_command`, `post_command`, `pre_mcp_tool`, `post_mcp_tool`, `post_file_write`, `pre_prompt`, `session_start`, `session_end`, and `agent_stop`. Written to `.cursor/hooks.json`.
- **Windsurf**: Supports `pre_file_read`, `post_file_read`, `pre_file_write`, `post_file_write`, `pre_command`, `post_command`, `pre_mcp_tool`, `post_mcp_tool`, `pre_prompt`, and `agent_stop`. Written to `.windsurf/hooks.json`.
- **Other Editors**: VS Code, Zed, and Codex do not support hooks. aix will warn if you define hooks that aren't supported by your target editors.
