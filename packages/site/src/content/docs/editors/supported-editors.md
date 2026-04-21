---
slug: editors/supported-editors
sidebar:
   order: 1
title: Supported Editors
description: Feature support matrix for all editors detected by aix.
---

aix currently supports 6 AI code editors.

| Feature     | Cursor | GitHub Copilot | Claude Code | Windsurf | Zed | Codex |
| ----------- | :----: | :------------: | :---------: | :------: | :-: | :---: |
| **Rules**   |   ✅   |       ✅       |     ✅      |    ✅    | ✅  |  ✅   |
| **Prompts** |   ✅   |       ✅       |     ✅      |    ✅    | ❌  |  ✅   |
| **MCP**     |   ✅   |       ✅       |     ✅      |    ✅    | ✅  |  ✅   |
| **Skills**  |   ✅   |       ✅       |     ✅      |    ✅    | ⚠️  |  ✅   |
| **Hooks**   |   ✅   |       ✅       |     ✅      |    ✅    | ❌  |  ❌   |

⚠️ = supported via pointer rules (no native Agent Skills)

## Feature Mapping

How `ai.json` concepts map to each editor:

### Cursor

- **Rules**: `.cursor/rules/*.mdc` (YAML frontmatter with `alwaysApply`, `globs`, `description` fields).
- **MCP**: `.cursor/mcp.json`.
- **Prompts**: `.cursor/prompts/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.cursor/skills/`.
- **Hooks**: `.cursor/hooks.json`. Supports `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `beforeReadFile`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `afterFileEdit`, `beforeSubmitPrompt`, and `stop`.

### GitHub Copilot

- **Rules**: `.github/instructions/*.instructions.md`.
- **MCP**: `.vscode/mcp.json`.
- **Prompts**: `.github/prompts/*.prompt.md`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.github/skills/`.
- **Hooks**: `.github/hooks/*.json`. Supports `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `preCompact`, `subagentStart`, `subagentStop`, and `stop`.

### Claude Code

- **Rules**: `.claude/rules/*.md`.
- **MCP**: `.mcp.json` at project root.
- **Prompts**: `.claude/commands/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.claude/skills/`.
- **Hooks**: `.claude/settings.json`. Supports `SessionStart`, `SessionEnd`, `InstructionsLoaded`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, and `ElicitationResult`.

### Windsurf

- **Rules**: `.windsurf/rules/*.md`. Supports Cascade's "auto" activation natively.
- **MCP**: Global config at `~/.codeium/windsurf/mcp_config.json`.
- **Prompts**: Cascade prompts.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.windsurf/skills/`.
- **Hooks**: `.windsurf/hooks.json`. Supports `pre_read_code`, `post_read_code`, `pre_write_code`, `post_write_code`, `pre_run_command`, `post_run_command`, `pre_mcp_tool_use`, `post_mcp_tool_use`, `pre_user_prompt`, `post_cascade_response`, `post_cascade_response_with_transcript`, and `post_setup_worktree`.

### Zed

- **Rules**: `.rules` file at project root (all rules concatenated). Zed also auto-detects `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, and other common rules files for compatibility.
- **MCP**: `.zed/settings.json` (project-level, using `context_servers` key). Also supports global config at `~/.config/zed/settings.json`.
- **Prompts**: Not supported (file-based user prompts). Zed supports MCP server-side prompts natively.
- **Skills**: Pointer rules (no native Agent Skills support).

### Codex

- **Rules**: `AGENTS.md` at project root (and in subdirectories for glob-scoped rules).
- **MCP**: Global config at `~/.codex/config.toml`. Also supports project-scoped config at `.codex/config.toml` (trusted projects only). aix currently only writes to the global config.
- **Prompts**: Global at `~/.codex/prompts/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.codex/skills/`.
