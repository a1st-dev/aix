---
sidebar:
   order: 60
title: Hooks
description: Run scripts on editor lifecycle events, written in each editor's native hook format.
---

**Hooks** run scripts in response to editor lifecycle events, such as a session starting, a
tool about to run, or a response finishing. You write one set of hooks in `ai.json`, and aix
translates each one into the native format of every editor you install to.

## Usage

Add a hook from the command line:

```bash
aix add hook pre_command --command "npm run lint"
aix add hook pre_file_write --matcher "Write|Edit" --command ./scripts/guard.sh
aix add hook ./hooks/guard.json
```

`aix add hook` installs the hook into the user-scope config of the editors it detects,
alongside whatever is already registered for that event. It does not change `ai.json` unless
you pass `--save`, and it installs at project scope when you pass `--project`.

`aix list hooks` shows the hooks your editors hold at user scope; add `--project` for project
scope or `--all` for both. `aix remove hook <event>` removes the event's hooks from your
editors, and from `ai.json` as well when you pass `--save`. See [`aix add`](/cli/add/) and
[`aix remove`](/cli/remove/) for every flag.

Or define hooks in `ai.json` directly:

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

When you run `aix install`, aix translates that block into each editor's native hook format
and writes it to the editor's hooks file. Nothing is dropped silently: aix warns when the
editor has no hooks support at all, when an individual event has no native equivalent, when an
action field cannot be expressed, and when the editor has no hooks file at the scope you
targeted.

To install one hook fragment without creating `ai.json`, use direct install:

```bash
aix install ./hooks/pre-command.jsonc --type hook --target claude-code --user
```

Installation preserves existing settings and distinct hook entries. For simple commands
with readable absolute script paths (including paths beginning with `$HOME` or `${HOME}`),
aix compares file contents rather than paths. Handlers with the same arguments, matchers, and
options use the incoming registration, so reinstalling updates the path without adding another
copy, even if handlers were grouped differently. Compound commands and unreadable paths use
the literal command instead. The output lists the installed native events, such as `Stop`,
`SubagentStop`, and `PreToolUse`.

Existing hook config files are backed up to `~/.aix/backups/` before writes. See
[Backups and restore](/concepts/backups-and-restore/). Invalid JSON stops installation without
replacing the file.

Hooks are inherited through [`extends`](/configuration/config-inheritance/) like the rest of
`ai.json`. For inherited configs, aix resolves existing relative script paths in simple
commands against the config's source directory. For example, `node ./hooks/check.mjs` uses the
script from the extended config while keeping the editor's working directory. For
commands with shell operators or variable expansion, use an explicit script path.

### Hooks and plugins

In editors with native plugin support, such as Claude Code, hooks defined in `ai.json` and
hooks bundled in enabled [plugins](/concepts/plugins/) both run on matching lifecycle events.

## Hook events

aix defines one set of event names that covers the events the supported editors expose. On
install, each name is mapped to the editor's native event.

### Lifecycle

- `session_start`, `session_end`
- `setup` (Claude Code's `--init-only` / `--init` / `--maintenance`)
- `interrupt` — when the user interrupts a running turn

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
- `pre_model_switch`, `post_model_switch` — around a change of model

### Agent / response

- `pre_agent`, `post_agent`
- `post_response`, `post_response_with_transcript`
- `agent_stop`, `subagent_start`, `subagent_stop`, `subagent_idle`

### System / context

- `pre_compact`, `post_compact`
- `task_created`, `task_completed`
- `worktree_setup`, `worktree_remove`
- `instructions_loaded`, `config_change`, `cwd_changed`, `directory_added`, `file_changed`
- `notification`, `elicitation`, `elicitation_result`, `error_occurred`

## Hook action fields

Every action under `hooks[].hooks[]` accepts an optional set of fields. aix writes the fields
the target editor supports and reports the rest as warnings at install time.

| Field                                 | Purpose                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                | `command` (default), `http`, `mcp_tool`, `prompt`, or `agent`.                                                                                                                   |
| `command`                             | Shell command to run.                                                                                                                                                            |
| `bash` / `powershell`                 | Cross-platform commands. Used directly by GitHub Copilot and Windsurf; Codex writes `powershell` as `commandWindows`; Claude Code expands to two entries with `shell` selectors. |
| `shell`                               | `bash` or `powershell` selector when only one of the command fields is set.                                                                                                      |
| `cwd` / `working_directory`           | Working directory for the command.                                                                                                                                               |
| `env`                                 | Environment variables to pass through (GitHub Copilot only today).                                                                                                               |
| `timeout`                             | Timeout in seconds. aix converts where needed (GitHub Copilot uses `timeoutSec`).                                                                                                |
| `async` / `async_rewake`              | Background execution. `async` also reaches Codex, which added it in 0.148.0; `async_rewake` is Claude Code only.                                                                 |
| `if`                                  | Permission-rule guard expression (Claude Code).                                                                                                                                  |
| `status_message`                      | Custom spinner message (Claude Code, Codex).                                                                                                                                     |
| `once`                                | Run once per session (Claude Code skill / agent frontmatter).                                                                                                                    |
| `url`, `headers`, `allowed_env_vars`  | HTTP webhook fields (Claude Code `http`; Grok CLI supports `url` and `headers`).                                                                                                 |
| `mcp_server`, `mcp_tool`, `mcp_input` | MCP tool dispatch (Claude Code `mcp_tool`).                                                                                                                                      |
| `prompt`, `model`                     | LLM-evaluated prompt or agent (Claude Code, Cursor, GitHub Copilot `sessionStart`).                                                                                              |
| `description`, `name`                 | Documentation / log identifier.                                                                                                                                                  |
| `fail_closed`                         | Block the action when the hook itself fails (Cursor).                                                                                                                            |
| `loop_limit`                          | Max auto-triggered follow-ups (Cursor).                                                                                                                                          |
| `show_output`                         | Surface output in the editor UI (Windsurf).                                                                                                                                      |

## Per-editor coverage

This table shows which aix events each editor has a native event for. "yes" means aix writes
the hook; "—" means the editor has no equivalent, and aix warns and skips that event for that
editor. Zed and OpenCode have no hooks support and are left out.

| Event                                                                                    | Claude Code |     Cursor      | GitHub Copilot | Windsurf | Codex | Google Antigravity | Grok CLI |
| ---------------------------------------------------------------------------------------- | :---------: | :-------------: | :------------: | :------: | :---: | :----------------: | :------: |
| `session_start`, `session_end`                                                           |     yes     |       yes       |      yes       |    —     |  yes  |        yes         |   yes    |
| `setup`                                                                                  |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `interrupt`                                                                              |      —      |        —        |       —        |    —     |  yes  |         —          |    —     |
| `pre_prompt`                                                                             |     yes     |       yes       |      yes       |   yes    |  yes  |         —          |   yes    |
| `user_prompt_expansion`                                                                  |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `pre_tool_use`, `post_tool_use`                                                          |     yes     |       yes       |      yes       |    —     |  yes  |        yes         |   yes    |
| `post_tool_use_failure`                                                                  |     yes     |       yes       |      yes       |    —     |   —   |         —          |   yes    |
| `post_tool_batch`                                                                        |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `permission_request`                                                                     |     yes     | as `preToolUse` |      yes       |    —     |  yes  |         —          |    —     |
| `permission_denied`                                                                      |     yes     |        —        |       —        |    —     |   —   |         —          |   yes    |
| `pre_file_read`                                                                          |     yes     |       yes       |      yes       |   yes    |  yes  |         —          |   yes    |
| `post_file_read`, `pre_file_write`                                                       |     yes     |        —        |      yes       |   yes    |  yes  |         —          |   yes    |
| `post_file_write`                                                                        |     yes     |       yes       |      yes       |   yes    |  yes  |         —          |   yes    |
| `pre_command`, `post_command`                                                            |     yes     |       yes       |      yes       |   yes    |  yes  |         —          |   yes    |
| `pre_mcp_tool`, `post_mcp_tool`                                                          |     yes     |       yes       |      yes       |   yes    |  yes  |         —          |   yes    |
| `pre_tab_file_read`, `post_tab_file_edit`                                                |      —      |       yes       |       —        |    —     |   —   |         —          |    —     |
| `pre_response_chunk`                                                                     |      —      |       yes       |       —        |    —     |   —   |         —          |    —     |
| `pre_model_switch`, `post_model_switch`                                                  |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `pre_agent`, `post_agent`                                                                |      —      |        —        |       —        |    —     |   —   |        yes         |    —     |
| `post_response`, `post_response_with_transcript`                                         |      —      |       yes       |       —        |   yes    |   —   |         —          |    —     |
| `agent_stop`                                                                             |     yes     |       yes       |      yes       |   yes    |  yes  |        yes         |   yes    |
| `subagent_start`, `subagent_stop`                                                        |     yes     |       yes       |      yes       |    —     |  yes  |         —          |    —     |
| `subagent_idle`                                                                          |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `pre_compact`                                                                            |     yes     |       yes       |      yes       |    —     |  yes  |         —          |   yes    |
| `post_compact`                                                                           |     yes     |        —        |       —        |    —     |  yes  |         —          |   yes    |
| `task_created`, `task_completed`                                                         |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `worktree_setup`                                                                         |     yes     |        —        |       —        |   yes    |   —   |         —          |    —     |
| `worktree_remove`                                                                        |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `instructions_loaded`, `config_change`, `cwd_changed`, `directory_added`, `file_changed` |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `notification`                                                                           |     yes     |        —        |      yes       |    —     |   —   |         —          |   yes    |
| `elicitation`, `elicitation_result`                                                      |     yes     |        —        |       —        |    —     |   —   |         —          |    —     |
| `error_occurred`                                                                         |      —      |        —        |      yes       |    —     |   —   |         —          |    —     |

`pre_tool_selection`, `pre_model_request`, and `post_model_response` are part of the event
vocabulary, but no supported editor has a native equivalent today.

Where an editor has no dedicated file, command, or MCP event, aix writes those events as the
editor's general tool hook with a matcher for the relevant tools. Each editor page lists the
native event names aix can write for it:
[Cursor](/editors/cursor/#cursor-feature-hooks),
[GitHub Copilot](/editors/copilot/#copilot-feature-hooks),
[Claude Code](/editors/claude-code/#claude-code-feature-hooks),
[Windsurf](/editors/windsurf/#windsurf-feature-hooks),
[Codex](/editors/codex/#codex-feature-hooks),
[Google Antigravity](/editors/antigravity/#antigravity-feature-hooks), and
[Grok CLI](/editors/grok/#grok-feature-hooks).

## Decision output per editor

aix only writes the hook configuration. Whether a hook blocks an action is decided between
your script and the editor. The output each editor expects on stdout, or the exit code it
treats as a block, is summarized below.

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

### GitHub Copilot

```json
{
   "permissionDecision": "allow|deny|ask",
   "permissionDecisionReason": "Required for deny",
   "modifiedArgs": { "field": "value" }
}
```

`agentStop` and `subagentStop` use `{ "decision": "block|allow", "reason": "..." }`.

### Windsurf

Pre-hooks block the action with **exit code 2** and use stderr as the rejection reason.
Post-hooks cannot block.

### Google Antigravity

```json
{
   "decision": "deny|allow",
   "reason": "Sent back to the agent on deny"
}
```

## Where hooks are written

Each editor has one hooks file per scope. Claude Code keeps hooks in its `settings.json`, and
the other editors use a dedicated `hooks.json`. The exact project and user paths are on each
editor page, linked in the list above.

Codex also reads hooks from inline `[hooks]` tables in `config.toml`. aix writes the JSON
files instead, so it never has to rewrite the TOML file that holds your MCP servers.

Zed and OpenCode do not support hooks. aix warns when an install that contains hooks targets
them.
