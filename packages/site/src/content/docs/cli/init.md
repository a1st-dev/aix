---
slug: cli/init
sidebar:
   order: 2
title: aix init
description: Initialize a new configuration.
---

Creates a new `ai.json` file in the current directory.

## Usage

```bash
aix init [flags]
```

## Flags

| Flag              | Description                                   |
| ----------------- | --------------------------------------------- |
| `--force` / `-f`  | Overwrite existing `ai.json` if it exists.    |
| `--from <editor>` | Import configuration from an existing editor. |

## Importing Config

The `--from` flag allows you to bootstrap `ai.json` from:

- `cursor`
- `vscode`
- `windsurf`
- `claude-code`
- `zed`
- `codex`

When importing, aix will:

1. Read the editor's config files.
2. Extract rules, prompts, and MCP settings.
3. Write extracted content to `.aix/imported/`.
4. Generate an `ai.json` linking to those files.

See [Import from an Editor](/getting-started/import-from-editor/) for details.
