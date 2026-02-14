---
slug: cli/search
sidebar:
   order: 4
title: aix search
description: Find skills and MCP servers.
---

Interactive search tool for discovering capabilities across npm and the [official MCP Registry](https://registry.modelcontextprotocol.io).

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
| `--experimental` / `-x`   | Enable experimental sources.            |

## JSON Output

Use with `--plain --json` for scripts:

```bash
aix search react --type skills --plain --json
```
