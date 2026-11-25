---
sidebar:
   order: 1
title: CLI overview
description: High-level overview of the aix CLI.
---

The `aix` CLI is your primary tool for managing AI agent configurations. It follows a syntax similar to `npm`.

## Global Flags

These flags are available on all commands:

| Flag                     | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `--config <path>` / `-c` | Path to `ai.json` (defaults to current dir). Can also be set via `$AI_JSON_CONFIG`.                         |
| `--user-home <dir>`      | Read and write user-scope config in `<dir>`, not your home directory. Can also be set via `$AIX_USER_HOME`. |
| `--quiet` / `-q`         | Suppress non-essential output.                                                                              |
| `--json`                 | Output results as JSON.                                                                                     |

## Command Groups

- **Core**: `init`, `install`, `sync`, `validate`
- **Management**: `add`, `remove`, `list`
- **Discovery**: `search`
- **Config**: `config get`, `config set`, `config show`
- **System**: `cache`, `backups`

`init --from` and `sync` sound similar, but they solve different problems:

- `aix init --from <editor>` reads an editor and writes a new `ai.json`.
- `aix sync <from> --to <to>` reads one editor and writes the supported equivalent into the
  destination editor.
- `aix install` reads `ai.json` and applies it to one or more editors.

## Aliases

| Command       | Alias         |
| ------------- | ------------- |
| `install`     | `i`           |
| `list`        | `ls`          |
| `cache clear` | `cache clean` |

## Environment Variables

- `AI_JSON_CONFIG`: Override the default `ai.json` path.
- `AIX_USER_HOME`: Directory aix uses in place of your home directory. See
  [Using an alternate home directory](#using-an-alternate-home-directory).
- `AIX_CACHE_DIR`, `AIX_CONFIG_DIR`, `AIX_DATA_DIR`: Move the CLI's own cache, config, and data
  directories (autocomplete scripts, update checks). These hold no editor config.

## Using an alternate home directory

User scope is the default for `aix install`, `aix add`, `aix remove`, and `aix sync`, so those
commands edit files such as `~/.claude.json`, `~/.codex/config.toml`, and `~/.aix/`. To try a
command without touching them, point aix at another directory:

```bash
# For one command
aix install --user-home /tmp/aix-trial

# For a whole shell session
export AIX_USER_HOME=/tmp/aix-trial
aix install
```

aix then resolves every user-scope path under that directory: it reads editor config from
there, writes there, and keeps its own `.aix/` state and backups there. Each command prints
the directory it is using. Project-scope files are not affected.

aix picks the home directory from the first of these that is set: `AIX_USER_HOME`, `HOME`,
`USERPROFILE`, then the operating system's answer. Unlike `HOME`, `AIX_USER_HOME` redirects
only aix, so the git and npm processes it starts keep using your real home.
