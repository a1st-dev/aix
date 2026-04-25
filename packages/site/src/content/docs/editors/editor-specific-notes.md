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

During `aix sync`, a project-scoped write to Windsurf will skip MCP changes and report that
they are global-only. That is expected.

## GitHub Copilot

GitHub Copilot CLI now uses `.mcp.json` at the project root and `~/.copilot/mcp-config.json`
for user-scoped MCP configuration. aix writes to those paths instead of the older
`.vscode/mcp.json` location.

When importing Copilot MCP config, aix prefers `.mcp.json` and falls back to `.github/mcp.json`
if the root file is absent. Rules, prompts, skills, and hooks still use the `.github/`
locations described in [Supported Editors](/editors/supported-editors/).

## Skills

For native-skill editors, aix keeps its managed copy of every installed skill in `.aix/skills/{name}/` and then symlinks that directory into the editor's native skills location. This keeps installs, removals, and `aix list --all` consistent across editors while still using each editor's expected directory layout.

## Zed

Zed supports rules via a single `.rules` file at the project root. All rules are concatenated into this file. Zed also auto-detects other common rules files (`.cursorrules`, `AGENTS.md`, `CLAUDE.md`, etc.) but only the first match is used. Hooks are not supported.

Zed supports MCP configuration at both project level (`.zed/settings.json`) and global level (`~/.config/zed/settings.json`). `aix` writes project-level MCP config to `.zed/settings.json` using the `context_servers` key. Zed also supports MCP Prompts (server-side prompt templates), though file-based user prompts are not supported.

Zed does not have native skill files. aix exposes skills as pointer rules instead. In
user-scoped syncs, aix can only do that when the destination has a writable user-level rules
file. If not, sync skips those skills and tells you which ones were skipped.

## Claude Code

Claude Code is the only editor that currently supports all lifecycle hooks (e.g., `pre_tool_use`, `agent_stop`).

Rules are written to `.claude/rules/*.md`, and prompts to `.claude/commands/`. MCP servers go to `.mcp.json` at the project root.

## Codex

Codex reads `AGENTS.md` files from the project root down to the current working directory, one per directory. aix writes rules to `AGENTS.md` at the project root using section-managed markdown (preserving any user-created content outside the managed `<!-- BEGIN AIX MANAGED SECTION -->` markers).

**Activation modes are not preserved.** Codex has no per-rule scoping mechanism — it treats all content in AGENTS.md equally. The `activation` type (`always`, `auto`, `manual`), `description`, and `globs` fields from ai.json are not included in the output. Rules are written as plain markdown with a `## {name}` heading.

The only scoping aix can provide is directory-based placement: rules with `glob` activation and a clear single-directory prefix (e.g. `src/utils/**/*.ts`) are placed in that subdirectory's `AGENTS.md` instead. This way, they only apply when Codex runs from that directory context. Rules without a clear prefix (like `**/*.test.ts`) go to the root file.

Project-installed Codex skills are exposed through `.agents/skills/`. Global/personal Codex skills still live under `~/.codex/skills/`.

MCP servers can be configured globally at `~/.codex/config.toml` or scoped to a project with `.codex/config.toml` (trusted projects only). aix currently writes MCP config to the global file and tracks entries in `~/.aix/state.json`. **Project-scoped MCP support is available upstream but not yet implemented in aix** — see the code changes note at the bottom of this page.

During `aix sync`, project-scoped writes skip those Codex MCP changes for the same reason and
report them in the output instead of failing the command.

Codex prompts are deprecated and unsupported as an aix install target. When `ai.json` contains prompts, aix converts them to instruction-only Agent Skills and installs them through the normal Codex skill path. If a prompt name conflicts with a skill name, the skill keeps its name and the converted prompt gets a `prompt-` prefix, with a numeric suffix if needed.

## Gemini

Gemini CLI reads `GEMINI.md` at the project root for project-level instructions. aix uses section-managed markdown to safely insert rules between `<!-- BEGIN AIX MANAGED SECTION -->` markers, so you can manually write other content in your `GEMINI.md` without it being overwritten.

MCP servers are stored in `.gemini/settings.json`, and prompts are written to individual `.toml` files in `.gemini/commands/`.

Like Codex, **activation modes are not preserved** in `GEMINI.md`. All rules are dumped into the managed section of the file as plain markdown.

## OpenCode

OpenCode reads `AGENTS.md` for project instructions. aix writes rules to the project root `AGENTS.md` with the same managed-section markers used for Codex, so manually written content outside the aix block is preserved.

OpenCode MCP servers live in the top-level `mcp` object in `opencode.json`. aix writes command-based servers as `type: "local"` with a command array, and URL-based servers as `type: "remote"`.

Prompts are written as markdown command files in `.opencode/commands/`. Skills are copied to `.aix/skills/{name}/` and exposed through `.opencode/skills/{name}`.

Hooks are not supported for OpenCode in aix.
