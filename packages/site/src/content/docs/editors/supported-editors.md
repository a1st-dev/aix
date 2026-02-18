---
slug: editors/supported-editors
sidebar:
   order: 1
title: Supported Editors
description: Feature support matrix for all editors detected by aix.
---

aix currently supports 6 AI code editors.

| Feature     | Cursor | GitHub Copilot | Claude Code | Windsurf | Zed | Codex |
| ----------- | :----: | :-----: | :---------: | :------: | :-: | :---: |
| **Rules**   |   ✅   |   ✅    |     ✅      |    ✅    | ✅  |  ✅   |
| **Prompts** |   ✅   |   ✅    |     ✅      |    ✅    | ❌  |  ✅   |
| **MCP**     |   ✅   |   ✅    |     ✅      |    ✅    | ✅  |  ✅   |
| **Skills**  |   ✅   |   ✅    |     ✅      |    ✅    | ⚠️  |  ✅   |
| **Hooks**   |   ✅   |   ✅    |     ✅      |    ✅    | ❌  |  ❌   |

⚠️ = supported via pointer rules (no native Agent Skills)

## Feature Mapping

How `ai.json` concepts map to each editor:

### Cursor

- **Rules**: `.cursor/rules/*.mdc` (YAML frontmatter with `alwaysApply`, `globs`, `description` fields).
- **MCP**: `.cursor/mcp.json`.
- **Prompts**: `.cursor/prompts/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.cursor/skills/`.
- **Hooks**: `.cursor/hooks.json`. Supports `pre_tool_use`, `post_tool_use`, `pre_file_read`, `pre_command`, `post_command`, `pre_mcp_tool`, `post_mcp_tool`, `post_file_write`, `pre_prompt`, `session_start`, `session_end`, and `agent_stop`.

### GitHub Copilot

- **Rules**: `.github/instructions/*.instructions.md`.
- **MCP**: `.vscode/mcp.json`.
- **Prompts**: `.github/prompts/*.prompt.md`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.github/skills/`.
- **Hooks**: `.github/hooks/*.json`. Supports `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`.

### Claude Code

- **Rules**: `.claude/rules/*.md`.
- **MCP**: `.mcp.json` at project root.
- **Prompts**: `.claude/commands/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.claude/skills/`.
- **Hooks**: `.claude/settings.json`. Supports `pre_tool_use`, `post_tool_use`, `pre_file_read`, `post_file_read`, `pre_file_write`, `post_file_write`, `pre_command`, `post_command`, `pre_mcp_tool`, `post_mcp_tool`, `pre_prompt`, `session_start`, `session_end`, and `agent_stop`.

### Windsurf

- **Rules**: `.windsurf/rules/*.md`. Supports Cascade's "auto" activation natively.
- **MCP**: Global config at `~/.codeium/windsurf/mcp_config.json`.
- **Prompts**: Cascade prompts.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.windsurf/skills/`.
- **Hooks**: `.windsurf/hooks.json`. Supports `pre_file_read`, `post_file_read`, `pre_file_write`, `post_file_write`, `pre_command`, `post_command`, `pre_mcp_tool`, `post_mcp_tool`, `pre_prompt`, and `agent_stop`.

### Zed

- **Rules**: `.rules` file at project root (all rules concatenated).
- **MCP**: `.zed/settings.json`.
- **Prompts**: Not supported.
- **Skills**: Pointer rules (no native Agent Skills support).

### Codex

- **Rules**: `AGENTS.md` at project root (and in subdirectories for glob-scoped rules).
- **MCP**: Global config at `~/.codex/config.toml`.
- **Prompts**: Global at `~/.codex/prompts/`.
- **Skills**: `.aix/skills/{name}/` with symlinks from `.codex/skills/`.
