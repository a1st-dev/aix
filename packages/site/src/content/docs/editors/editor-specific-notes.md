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

When you install an MCP server to Windsurf, `aix` modifies your global Windsurf config (`~/.codeium/windsurf/mcp_config.json`). It tracks this addition in `~/.aix/global-tracking.json` so that if you remove the server (or delete the project), aix knows whether it's safe to remove it from the global config.

## Zed

Zed supports rules via a single `.rules` file at the project root. All rules are concatenated into this file. Prompts and hooks are not supported.

Zed only supports global MCP configuration via `.zed/settings.json`. Similar to Windsurf, `aix` manages the settings file and tracks usage.

## Claude Code

Claude Code is the only editor that currently supports all lifecycle hooks (e.g., `pre_tool_use`, `agent_stop`).

Rules are written to `.claude/rules/*.md`, and prompts to `.claude/commands/`. MCP servers go to `.mcp.json` at the project root.

## Codex

Codex reads `AGENTS.md` files from the project root down to the current working directory, one per directory. aix writes rules to `AGENTS.md` at the project root.

**Activation modes are not preserved.** Codex has no per-rule scoping mechanism — it treats all content in AGENTS.md equally. The `activation` type (`always`, `auto`, `manual`), `description`, and `globs` fields from ai.json are not included in the output. Rules are written as plain markdown with a `## {name}` heading.

The only scoping aix can provide is directory-based placement: rules with `glob` activation and a clear single-directory prefix (e.g. `src/utils/**/*.ts`) are placed in that subdirectory's `AGENTS.md` instead. This way, they only apply when Codex runs from that directory context. Rules without a clear prefix (like `**/*.test.ts`) go to the root file.

Skills are installed to `.codex/skills/`.

MCP servers are global-only, configured at `~/.codex/config.toml`. Prompts are also global, stored at `~/.codex/prompts/`. aix tracks global entries in `~/.aix/global-tracking.json` the same way it does for Windsurf and Zed.
