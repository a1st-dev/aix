---
slug: editors/editor-specific-notes
sidebar:
   order: 2
title: Editor-Specific Notes
description: Quirks and details for specific editors.
---

## Cursor

Cursor supports hooks via `.cursor/hooks.json`. aix translates generic event names to Cursor's format (e.g., `pre_command` → `beforeShellExecution`, `agent_stop` → `stop`). Not all hook events are supported — see [Hooks](/concepts/hooks/) for details.

## Windsurf

Windsurf does not support project-specific MCP configuration files yet. All MCP configuration is global.

When you install an MCP server to Windsurf, `aix` modifies your global Windsurf config (`~/.codeium/windsurf/mcp_config.json`). It tracks this in `~/.aix/state.json` so that if you remove the server (or delete the project), aix knows whether it's safe to remove it from the global config.

## Skills

For native-skill editors, aix keeps its managed copy of every installed skill in `.aix/skills/{name}/` and then symlinks that directory into the editor's native skills location. This keeps installs, removals, and `aix list --all` consistent across editors while still using each editor's expected directory layout.

## Zed

Zed supports rules via a single `.rules` file at the project root. All rules are concatenated into this file. Zed also auto-detects other common rules files (`.cursorrules`, `AGENTS.md`, `CLAUDE.md`, etc.) but only the first match is used. Hooks are not supported.

Zed supports MCP configuration at both project level (`.zed/settings.json`) and global level (`~/.config/zed/settings.json`). `aix` writes project-level MCP config to `.zed/settings.json` using the `context_servers` key. Zed also supports MCP Prompts (server-side prompt templates), though file-based user prompts are not supported.

## Claude Code

Claude Code is the only editor that currently supports all lifecycle hooks (e.g., `pre_tool_use`, `agent_stop`).

Rules are written to `.claude/rules/*.md`, and prompts to `.claude/commands/`. MCP servers go to `.mcp.json` at the project root.

## Codex

Codex reads `AGENTS.md` files from the project root down to the current working directory, one per directory. aix writes rules to `AGENTS.md` at the project root.

**Activation modes are not preserved.** Codex has no per-rule scoping mechanism — it treats all content in AGENTS.md equally. The `activation` type (`always`, `auto`, `manual`), `description`, and `globs` fields from ai.json are not included in the output. Rules are written as plain markdown with a `## {name}` heading.

The only scoping aix can provide is directory-based placement: rules with `glob` activation and a clear single-directory prefix (e.g. `src/utils/**/*.ts`) are placed in that subdirectory's `AGENTS.md` instead. This way, they only apply when Codex runs from that directory context. Rules without a clear prefix (like `**/*.test.ts`) go to the root file.

Project-installed Codex skills are exposed through `.agents/skills/`. Global/personal Codex skills still live under `~/.codex/skills/`.

MCP servers can be configured globally at `~/.codex/config.toml` or scoped to a project with `.codex/config.toml` (trusted projects only). aix currently writes MCP config to the global file and tracks entries in `~/.aix/state.json`. **Project-scoped MCP support is available upstream but not yet implemented in aix** — see the code changes note at the bottom of this page. Prompts are global-only, stored at `~/.codex/prompts/`.

---

## Potential Code Changes

The following upstream changes have been identified but are **not yet reflected in the aix codebase**:

### Codex: Project-scoped MCP

Codex now supports project-scoped MCP configuration via `.codex/config.toml` alongside the existing global `~/.codex/config.toml`. The aix `CodexMcpStrategy` currently extends `GlobalMcpStrategy`, treating Codex MCP as global-only. To support project-scoped MCP:

- Refactor `CodexMcpStrategy` to no longer extend `GlobalMcpStrategy`.
- Add a project-level config path (`.codex/config.toml`) alongside the global path.
- The TOML format (`[mcp_servers.<name>]` sections) remains the same for both scopes.
