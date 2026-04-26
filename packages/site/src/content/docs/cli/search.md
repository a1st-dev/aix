---
sidebar:
   order: 4
title: aix search
description: Find skills and MCP servers.
---

Interactive search tool for discovering capabilities across the skills.sh library and the [official MCP Registry](https://registry.modelcontextprotocol.io).

## Usage

```bash
aix search [query] [flags]
```

Without arguments, it opens an interactive TUI (Terminal User Interface).

## Interactive Mode

```bash
aix search
```

- **Up/Down**: Navigate results
- **Enter**: Select/Install
- **Tab**: Switch between Skills and MCP tabs
- **Ctrl+C**: Exit

## Flags

| Flag                      | Description                             |
| ------------------------- | --------------------------------------- |
| `--type <type>` / `-t`    | Filter by type: `skills`, `mcp`.        |
| `--plain` / `-p`          | Output as plain text (non-interactive). |
| `--registry <url>` / `-r` | Custom npm registry URL.                |

## JSON Output

Use with `--plain --json` for scripts:

```bash
aix search react --type skills --plain --json
```

Interactive skill installs resolve Skills Library results to concrete repo paths, then call `aix add skill`, so search installs are saved and installed through the same native aix skill flow as manual adds.
