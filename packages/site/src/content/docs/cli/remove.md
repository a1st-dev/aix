---
slug: cli/remove
sidebar:
   order: 7
title: aix remove
description: Remove items from your configuration.
---

Removes items from `ai.json` (or `ai.local.json`) and updates editors.

## Usage

```bash
aix remove <type> <name> [flags]
```

## Commands

### `aix remove skill`

```bash
aix remove skill react
```

### `aix remove mcp`

```bash
aix remove mcp github
```

Also cleans up global MCP config if the server is no longer used by any project.

## Flags

| Flag             | Description                                    |
| ---------------- | ---------------------------------------------- |
| `--local` / `-l` | Remove from `ai.local.json`.                   |
| `--yes` / `-y`   | Skip confirmation prompt.                      |
| `--no-delete`    | Skip deleting files from editors (for skills). |
| `--no-sync`      | Skip syncing editor config (for MCP).          |
