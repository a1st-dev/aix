---
sidebar:
   order: 1
title: CLI overview
description: The aix commands, the flags they share, and the environment variables they read.
---

Every aix command has the form `aix <command> [arguments] [flags]`. A command with
subcommands separates them with a space, as in `aix add skill` or `aix list mcp`.

`aix <command> --help` prints the arguments and flags of any command.

## Commands

| Command                                                                 | What it does                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`aix init`](/cli/init/)                                                | Create `ai.json`, empty or imported from an editor.               |
| [`aix add <type>`](/cli/add/)                                           | Install one item into your editors, and optionally save it.       |
| [`aix install`](/cli/install/)                                          | Install `ai.json`, a remote config, or a single item.             |
| [`aix remove <type>`](/cli/remove/)                                     | Remove one item from your editors, and optionally from `ai.json`. |
| [`aix sync`](/cli/sync/)                                                | Copy supported config from one editor to another.                 |
| [`aix list`](/cli/list/)                                                | List the configuration your editors hold.                         |
| [`aix search`](/cli/search/)                                            | Find skills and MCP servers.                                      |
| [`aix validate`](/cli/validate/)                                        | Check `ai.json` against the schema and the lockfile.              |
| [`aix config show`, `get`, `set`](/cli/config/)                         | Show the config files in use, and read or set values.             |
| [`aix cache clear`](/cli/cache/)                                        | Delete the files aix downloaded.                                  |
| [`aix backups`](/cli/backups/)                                          | List the backups aix made.                                        |
| [`aix backups restore`](/cli/backups/#aix-backups-restore)              | Copy a backup over the file it was taken from.                    |
| [`aix update`](/getting-started/installation/#update)                   | Update the aix CLI.                                               |
| [`aix autocomplete`](/getting-started/installation/#shell-autocomplete) | Print the steps to set up shell completion.                       |

`init --from`, `sync`, and `install` sound similar, but they solve different problems:

- `aix init --from <editor>` reads an editor and writes a new `ai.json`.
- `aix sync <from> --to <to>` reads one editor and writes the supported equivalent into the
  destination editor.
- `aix install` reads `ai.json` and applies it to one or more editors.

## Global flags

Every command accepts these flags:

| Flag                     | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `--config <path>` / `-c` | Use this `ai.json` in place of the one aix would find. Can also be set with `AI_JSON_CONFIG`.               |
| `--user-home <dir>`      | Read and write user-scope config in `<dir>`, not your home directory. Can also be set with `AIX_USER_HOME`. |
| `--quiet` / `-q`         | Suppress non-essential output.                                                                              |
| `--json`                 | Print the result as JSON.                                                                                   |

`--config` matters only to the commands that read `ai.json`: `aix install` without a source,
`aix validate`, `aix config`, and `aix add` or `aix remove` with `--save`. Without it, those
commands use the `ai.json` in the working directory or the nearest parent directory. The
other commands accept the flag and ignore it.

## Scope

Commands that read or write editor config work at user scope or project scope. `aix install`
uses the `scope` field of `ai.json` and falls back to user scope. `aix add`, `aix remove`,
`aix sync`, and `aix list` use user scope. Each of them takes a flag to work at project scope
instead. [User scope and project scope](/concepts/scopes/) has the full rules.

## Editor names

Flags that take an editor, such as `--target`, accept these names:

| Editor             | Name          | Also accepted |
| ------------------ | ------------- | ------------- |
| Cursor             | `cursor`      |               |
| GitHub Copilot     | `copilot`     |               |
| Claude Code        | `claude-code` |               |
| Windsurf           | `windsurf`    | `devin`       |
| Zed                | `zed`         |               |
| Codex              | `codex`       |               |
| Google Antigravity | `antigravity` | `agy`         |
| OpenCode           | `opencode`    |               |
| Grok CLI           | `grok`        | `grok-cli`    |

## Aliases

| Command       | Alias         |
| ------------- | ------------- |
| `install`     | `i`           |
| `list`        | `ls`          |
| `list mcp`    | `list mcps`   |
| `cache clear` | `cache clean` |

## Running without a terminal

Some commands ask a question. In a script or a CI job there is nobody to answer, so the
command fails and names the flag to pass instead:

- `aix install` asks which editors to use when it detects several. Pass `--target`, or list
  the editors in `ai.json`.
- `aix remove` and `aix backups restore` ask for confirmation. Pass `--yes`.
- `aix add mcp <name>` asks which registry server to use when several match. Pass
  `--command` or `--url` to define the server yourself.

`aix install`, `aix add`, `aix sync`, and `aix remove` exit with a non-zero status when they
fail for any editor.

## Environment variables

- `AI_JSON_CONFIG`: Same as `--config`.
- `AIX_USER_HOME`: Directory aix uses in place of your home directory. See
  [Using an alternate home directory](#using-an-alternate-home-directory).
- `AIX_CACHE_DIR`, `AIX_CONFIG_DIR`, `AIX_DATA_DIR`: Move the CLI's own cache, config, and data
  directories (autocomplete scripts, update checks). These hold no editor config.

## Using an alternate home directory

User-scope commands edit files such as `~/.claude.json`, `~/.codex/config.toml`, and `~/.aix/`.
To try a command without touching them, point aix at another directory:

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
