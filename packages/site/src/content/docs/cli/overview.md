---
slug: cli/overview
sidebar:
   order: 1
title: CLI overview
description: High-level overview of the aix CLI.
---

The `aix` CLI is your primary tool for managing AI agent configurations. It follows a syntax similar to `npm`.

## Global Flags

These flags are available on all commands:

| Flag                     | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `--config <path>` / `-c` | Path to `ai.json` (defaults to current dir). Can also be set via `$AI_JSON_CONFIG`. |
| `--quiet` / `-q`         | Suppress non-essential output.                                                      |
| `--json`                 | Output results as JSON.                                                             |

## Command Groups

- **Core**: `init`, `install`, `sync`, `validate`
- **Management**: `add`, `remove`, `list`
- **Discovery**: `search`
- **Config**: `config get`, `config set`, `config show`
- **System**: `cache`, `backups`, `global`

`init --from` and `sync` sound similar, but they solve different problems:

- `aix init --from <editor>` reads an editor and writes a new `ai.json`.
- `aix sync <from> --to <to>` reads one editor, normalizes that config through aix's internal
  bridge format, then writes what the destination editor can represent.
- `aix install` reads `ai.json` and applies it to one or more editors.

## Aliases

| Command       | Alias         |
| ------------- | ------------- |
| `install`     | `i`           |
| `list`        | `ls`          |
| `cache clear` | `cache clean` |

## Environment Variables

- `AI_JSON_CONFIG`: Override the default `ai.json` path.
- `AIX_LOG_LEVEL`: Set detailed logging (`debug`, `info`, `warn`, `error`).
