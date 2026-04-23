---
slug: editors/supported-editors
sidebar:
   order: 1
title: Supported Editors
description: Feature support matrix for all editors detected by aix.
---

aix currently supports 7 AI code editors.

| Editor         | Rules | Prompts | MCP | Skills | Hooks | AGENTS.md | `.agents/` folder |
| -------------- | :---: | :-----: | :-: | :----: | :---: | :-------: | :---------------: |
| Cursor         |  ✅   |   ✅    | ✅  |   ✅   |  ✅   |    Yes    |        Yes        |
| GitHub Copilot |  ✅   |   ✅    | ✅  |   ✅   |  ✅   |    Yes    |        Yes        |
| Claude Code    |  ✅   |   ✅    | ✅  |   ✅   |  ✅   |    No     |        No         |
| Windsurf       |  ✅   |   ✅    | ✅  |   ✅   |  ✅   |    Yes    |        Yes        |
| Zed            |  ✅   |   ❌    | ✅  |   ⚠️   |  ❌   |    Yes    |        No         |
| Codex          |  ✅   |   ⚠️    | ✅  |   ✅   |  ❌   |    Yes    |        Yes        |
| Gemini         |  ✅   |   ✅    | ✅  |   ✅   |  ❌   |    Yes    |        Yes        |

⚠️ = supported through an adapter behavior instead of a native editor feature. Zed skills use pointer rules. Codex prompts convert to skills.

## Feature Mapping

How `ai.json` concepts map to each editor:

### Cursor

- **Rules**: `.cursor/rules/*.mdc` (YAML frontmatter with `alwaysApply`, `globs`, `description` fields).
- **MCP**: `.cursor/mcp.json`.
- **Prompts**: `.cursor/prompts/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.cursor/skills/`.
- **Hooks**: `.cursor/hooks.json`. Supports `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `beforeReadFile`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `afterFileEdit`, `beforeSubmitPrompt`, and `stop`.

#### .agents/ folder

Cursor supports [`AGENTS.md`][cursor-rules] as a plain Markdown alternative to `.cursor/rules`, with root-level scope. Cursor also supports Agent Skills; Cursor's own blog describes support for the [Agent Skills open standard][cursor-skills-blog], and current [docs excerpts in the Cursor forum][cursor-forum-skills] list `.agents/skills/` and `.cursor/skills/` as project-level skill directories.

### GitHub Copilot

- **Rules**: `.github/instructions/*.instructions.md`.
- **MCP**: `.vscode/mcp.json`.
- **Prompts**: `.github/prompts/*.prompt.md`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.github/skills/`.
- **Hooks**: `.github/hooks/*.json`. Supports `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `preCompact`, `subagentStart`, `subagentStop`, and `stop`.

#### .agents/ folder

GitHub Copilot supports [`.agents/skills/`][copilot-skills] for both project skills and personal skills (`~/.agents/skills/`). Copilot coding agent also supports [one or more `AGENTS.md` files][copilot-repo-instructions] anywhere in the repository; the nearest `AGENTS.md` in the directory tree takes precedence.

### Claude Code

- **Rules**: `.claude/rules/*.md`.
- **MCP**: `.mcp.json` at project root.
- **Prompts**: `.claude/commands/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.claude/skills/`.
- **Hooks**: `.claude/settings.json`. Supports `SessionStart`, `SessionEnd`, `InstructionsLoaded`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, and `ElicitationResult`.

#### .agents/ folder

Claude Code supports Agent Skills, but its documented skill paths are [`.claude/skills/`, `~/.claude/skills/`, plugin skills, and enterprise managed skills][claude-skills]. It does not document native `.agents/skills/` discovery or `AGENTS.md`; its native repo instruction file is [`CLAUDE.md`][claude-memory].

### Windsurf

- **Rules**: `.windsurf/rules/*.md`. Supports Cascade's "auto" activation natively.
- **MCP**: Global config at `~/.codeium/windsurf/mcp_config.json`.
- **Prompts**: Cascade prompts.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.windsurf/skills/`.
- **Hooks**: `.windsurf/hooks.json`. Supports `pre_read_code`, `post_read_code`, `pre_write_code`, `post_write_code`, `pre_run_command`, `post_run_command`, `pre_mcp_tool_use`, `post_mcp_tool_use`, `pre_user_prompt`, `post_cascade_response`, `post_cascade_response_with_transcript`, and `post_setup_worktree`.

#### .agents/ folder

Windsurf discovers [`.agents/skills/` and `~/.agents/skills/`][windsurf-skills] for cross-agent compatibility, alongside its native `.windsurf/skills/` and `~/.codeium/windsurf/skills/` paths. It also [discovers `AGENTS.md` and `agents.md`][windsurf-agents-md] files throughout the workspace and scopes them by location.

### Zed

- **Rules**: `.rules` file at project root (all rules concatenated). Zed also auto-detects `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, and other common rules files for compatibility.
- **MCP**: `.zed/settings.json` (project-level, using `context_servers` key). Also supports global config at `~/.config/zed/settings.json`.
- **Prompts**: Not supported (file-based user prompts). Zed supports MCP server-side prompts natively.
- **Skills**: Pointer rules (no native Agent Skills support).

#### .agents/ folder

Zed supports [`AGENTS.md`][zed-rules] as one of several compatibility filenames for project rules. It does not document Agent Skills or `.agents/skills/` discovery, so aix exposes skills through pointer rules instead.

### Codex

- **Rules**: `AGENTS.md` at project root (and in subdirectories for glob-scoped rules).
- **MCP**: Global config at `~/.codex/config.toml`. Also supports project-scoped config at `.codex/config.toml` (trusted projects only). aix currently only writes to the global config.
- **Prompts**: Deprecated and unsupported natively. aix converts `ai.json` prompts to Agent Skills during install instead of writing `~/.codex/prompts/`.
- **Skills**: `.aix/skills/{name}/` with project symlinks from `.agents/skills/`. Global/personal Codex skills live under `~/.codex/skills/`.

#### .agents/ folder

Codex has native support for both pieces of the standard. It discovers skills from [`.agents/skills/`][codex-skills] in the current directory, parent directories up to the repo root, the repo root, `$HOME/.agents/skills`, `/etc/codex/skills`, and bundled system skills. It also reads [`AGENTS.md`][codex-agents-md] from the Codex home directory and from the project root down to the current working directory, layering more specific files later in the prompt.

#### Prompt conversion

Codex no longer has a supported prompt install target in aix. OpenAI's current Codex docs describe Agent Skills as the reusable workflow format, with each skill stored as a directory containing `SKILL.md` plus optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml` files. When installing to Codex, aix converts each `ai.json` prompt into an instruction-only skill and exposes it through `.agents/skills/`.

If a prompt and a skill use the same name in `ai.json`, the real skill keeps the name. The converted prompt is renamed to `prompt-{name}`; if that also conflicts, aix adds a numeric suffix such as `prompt-{name}-2`.

### Gemini

- **Rules**: `GEMINI.md` at project root (using section-managed markdown to preserve user content).
- **MCP**: `.gemini/settings.json` (project and global supported).
- **Prompts**: `.gemini/commands/*.toml`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.gemini/skills/`.
- **Hooks**: Not supported.

#### .agents/ folder

Gemini CLI supports [`.agents/skills/`][gemini-skills] as an alias for `.gemini/skills/`, at both workspace and user scope. Within the same scope, `.agents/skills/` takes precedence over `.gemini/skills/`. Gemini's default context file is `GEMINI.md`, but [`context.fileName`][gemini-config] can be configured to load `AGENTS.md`, so aix treats `AGENTS.md` support as yes.

[codex-skills]: https://developers.openai.com/codex/skills
[codex-agents-md]: https://developers.openai.com/codex/guides/agents-md
[gemini-skills]: https://geminicli.com/docs/cli/skills/
[gemini-config]: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
[copilot-skills]: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
[copilot-repo-instructions]: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
[windsurf-skills]: https://docs.windsurf.com/windsurf/cascade/skills
[windsurf-agents-md]: https://docs.windsurf.com/windsurf/cascade/agents-md
[cursor-skills-blog]: https://cursor.com/blog/dynamic-context-discovery
[cursor-rules]: https://docs.cursor.com/context/rules-for-ai
[cursor-forum-skills]: https://forum.cursor.com/t/why-agents-can-not-see-my-skills-in-cursor-skills-folder/158131
[claude-skills]: https://code.claude.com/docs/en/skills
[claude-memory]: https://docs.anthropic.com/en/docs/claude-code/memory
[zed-rules]: https://zed.dev/docs/ai/rules
