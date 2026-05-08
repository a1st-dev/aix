---
sidebar:
   order: 5
title: Hooks
description: Trigger scripts on AI lifecycle events across every supported editor.
---

**Hooks** run scripts in response to lifecycle events (a session starts, a tool is about
to run, a model response just landed, …). aix lets you author one set of hooks in
`ai.json` and translates each one into the native format of every target editor.

## Usage

Define hooks in `ai.json`:

```json
{
   "hooks": {
      "session_start": [
         {
            "matcher": ".*",
            "hooks": [{ "command": "./scripts/init-session.sh", "show_output": true }]
         }
      ],
      "pre_tool_use": [
         {
            "matcher": "Bash",
            "hooks": [{ "command": "./scripts/audit-bash.sh" }]
         }
      ]
   }
}
```

When you run `aix install`, each enabled editor adapter translates that block into the
editor's native config format and writes it to the right file. Unsupported events are
warned about — never silently dropped.

## Hook events

aix defines a normalized event vocabulary covering every event surfaced by the supported
editors. Adapters map each to the editor's native equivalent.

### Lifecycle

- `session_start`, `session_end`
- `setup` (Claude Code's `--init-only` / `--init` / `--maintenance`)

### Prompt

- `pre_prompt` — before submitting the user's prompt
- `user_prompt_expansion` — when a slash command expands into its body

### Tool execution

- `pre_tool_use`, `post_tool_use`, `post_tool_use_failure`
- `post_tool_batch` — after a parallel tool batch finishes
- `pre_tool_selection` — before the model decides which tools it can call
- `permission_request`, `permission_denied`
- `pre_file_read`, `post_file_read`
- `pre_file_write`, `post_file_write`
- `pre_command`, `post_command`
- `pre_mcp_tool`, `post_mcp_tool`
- `pre_tab_file_read`, `post_tab_file_edit` (Cursor Tab)

### Model

- `pre_model_request` — before sending a request to the LLM
- `post_model_response` — when the LLM emits a response
- `pre_response_chunk` — for every streaming chunk

### Agent / response

- `pre_agent`, `post_agent`
- `post_response`, `post_response_with_transcript`
- `agent_stop`, `subagent_start`, `subagent_stop`, `subagent_idle`

### System / context

- `pre_compact`, `post_compact`
- `task_created`, `task_completed`
- `worktree_setup`, `worktree_remove`
- `instructions_loaded`, `config_change`, `cwd_changed`, `file_changed`
- `notification`, `elicitation`, `elicitation_result`, `error_occurred`

## Hook action fields

Every action under `hooks[].hooks[]` accepts an optional set of fields. Adapters use
whatever the target editor surfaces and report the rest via install-time warnings.

| Field                                 | Purpose                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`                                | `command` (default), `http`, `mcp_tool`, `prompt`, or `agent`.                                                             |
| `command`                             | Shell command to run.                                                                                                      |
| `bash` / `powershell`                 | Cross-platform commands. Used directly by Copilot and Windsurf; Claude Code expands to two entries with `shell` selectors. |
| `shell`                               | `bash` or `powershell` selector when only one of the command fields is set.                                                |
| `cwd` / `working_directory`           | Working directory for the command.                                                                                         |
| `env`                                 | Environment variables to pass through (Copilot only today).                                                                |
| `timeout`                             | Timeout in seconds. Adapters convert (Gemini uses milliseconds, Copilot uses `timeoutSec`).                                |
| `async` / `async_rewake`              | Background execution (Claude Code).                                                                                        |
| `if`                                  | Permission-rule guard expression (Claude Code).                                                                            |
| `status_message`                      | Custom spinner message (Claude Code).                                                                                      |
| `once`                                | Run once per session (Claude Code skill / agent frontmatter).                                                              |
| `url`, `headers`, `allowed_env_vars`  | HTTP webhook fields (Claude Code `http`).                                                                                  |
| `mcp_server`, `mcp_tool`, `mcp_input` | MCP tool dispatch (Claude Code `mcp_tool`).                                                                                |
| `prompt`, `model`                     | LLM-evaluated prompt or agent (Claude Code, Cursor, Copilot `sessionStart`).                                               |
| `description`, `name`                 | Documentation / log identifier.                                                                                            |
| `fail_closed`                         | Block the action when the hook itself fails (Cursor).                                                                      |
| `loop_limit`                          | Max auto-triggered follow-ups (Cursor).                                                                                    |
| `show_output`                         | Surface output in the editor UI (Windsurf).                                                                                |

## Per-editor coverage

| Event family                                                       | Claude Code |                       Cursor                        |       Copilot        |                Windsurf                 |        Gemini        |
| ------------------------------------------------------------------ | :---------: | :-------------------------------------------------: | :------------------: | :-------------------------------------: | :------------------: |
| `session_start` / `session_end`                                    |     yes     |                         yes                         |         yes          |                    —                    |         yes          |
| `setup`                                                            |     yes     |                          —                          |          —           |                    —                    |          —           |
| `user_prompt_expansion`                                            |     yes     |                          —                          |          —           |                    —                    |          —           |
| `pre_prompt`                                                       |     yes     |                         yes                         |         yes          |                   yes                   |          —           |
| `pre_tool_use` / `post_tool_use`                                   |     yes     |                         yes                         |         yes          | maps to read/write/command/mcp variants |         yes          |
| `post_tool_use_failure`                                            |     yes     |                         yes                         |         yes          |                    —                    |          —           |
| `permission_request` / `permission_denied`                         |     yes     |        `permission_request` via `preToolUse`        |    yes (request)     |                    —                    |          —           |
| `pre_tool_selection`                                               |      —      |                          —                          |          —           |                    —                    |         yes          |
| `pre_model_request` / `post_model_response` / `pre_response_chunk` |      —      | partial (`afterAgentResponse`, `afterAgentThought`) |          —           |                    —                    |         yes          |
| `pre_agent` / `post_agent`                                         |      —      |                          —                          |          —           |                    —                    |         yes          |
| `post_response` / `post_response_with_transcript`                  |      —      |                       partial                       |          —           |      yes (with transcript variant)      |          —           |
| `agent_stop` / `subagent_*`                                        |     yes     |                         yes                         |         yes          |            `agent_stop` only            |          —           |
| `pre_compact` / `post_compact`                                     |     yes     |                   yes (pre only)                    |    yes (pre only)    |                    —                    | yes (`PreCompress`)  |
| Tab hooks                                                          |      —      |                         yes                         |          —           |                    —                    |          —           |
| `notification` / `elicitation*`                                    |     yes     |                          —                          | yes (`notification`) |                    —                    | yes (`Notification`) |
| `error_occurred`                                                   |      —      |                          —                          |         yes          |                    —                    |          —           |
| Worktree / fs / config events                                      |     yes     |                          —                          |          —           |       `post_setup_worktree` only        |          —           |

## Decision output (per editor)

aix only writes the hook configuration. Whether a hook _blocks_ an action is a contract
between your script and the editor. The shapes scripts must print to stdout (or signal
via exit code 2) are summarized below.

### Claude Code

```json
{
   "decision": "block",
   "reason": "Why blocked",
   "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow|deny|ask|defer",
      "permissionDecisionReason": "Reason",
      "updatedInput": { "field": "value" }
   }
}
```

Exit code 2 also blocks the matching event.

### Cursor

```json
{
   "permission": "allow|deny|ask",
   "user_message": "shown to the user",
   "agent_message": "shown to the agent",
   "updated_input": { "field": "value" }
}
```

Cursor also accepts `failClosed: true` on the hook config to block on hook errors.

### GitHub Copilot CLI

```json
{
   "permissionDecision": "allow|deny|ask",
   "permissionDecisionReason": "Required for deny",
   "modifiedArgs": { "field": "value" }
}
```

`agentStop` and `subagentStop` use `{ "decision": "block|allow", "reason": "..." }`.

### Windsurf Cascade

Pre-hooks block the action with **exit code 2** and use stderr as the rejection reason.
Post-hooks cannot block.

### Gemini CLI

```json
{
   "decision": "deny|allow",
   "reason": "Sent back to the agent on deny",
   "hookSpecificOutput": {
      "additionalContext": "Injected before the response",
      "tool_input": { "field": "value" },
      "tailToolCallRequest": { "name": "another_tool", "args": {} }
   }
}
```

## Editor-native config locations

| Editor      | Project                                                  | User                             |
| ----------- | -------------------------------------------------------- | -------------------------------- |
| Claude Code | `.claude/settings.json`                                  | `~/.claude/settings.json`        |
| Cursor      | `.cursor/hooks.json` (with `version: 1`)                 | `~/.cursor/hooks.json`           |
| Copilot     | `.github/hooks/hooks.json`                               | `~/.copilot/hooks/hooks.json`    |
| Windsurf    | `.windsurf/hooks.json`                                   | `~/.codeium/windsurf/hooks.json` |
| Gemini      | `.gemini/settings.json` (under `hooks`, merged with MCP) | `~/.gemini/settings.json`        |

Editors not in the table (Codex, Zed, OpenCode) do not currently support hooks. aix
warns when you target them with a hook config.
