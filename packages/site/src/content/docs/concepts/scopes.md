---
sidebar:
   order: 2
title: User scope and project scope
description: The two places aix writes editor config, and how each command chooses between them.
---

Every editor reads config from two places: files under your home directory, and files inside
the project you have open. aix calls these user scope and project scope. Each command that
reads or writes editor config works at one scope at a time.

## The two scopes

**User scope** is the editor config under your home directory, such as `~/.claude.json` or
`~/.codex/config.toml`. An editor applies it to every project you open. aix keeps its own
records for user-scope installs in `~/.aix/`.

**Project scope** is the editor config inside one project, such as `.mcp.json` or
`.claude/rules/`. An editor applies it only in that project. aix keeps its records for
project-scope installs in the project's `.aix/` directory.

The project is the directory that holds the `ai.json` a command loaded. For
`aix install <source>`, and for commands that load no `ai.json`, it is the working directory.

Each editor's page under [Supported editors](/editors/supported-editors/) lists the exact
user-scope and project-scope path for every feature.

## How each command chooses a scope

| Command                                 | Scope when you pass no scope flag                               |
| --------------------------------------- | --------------------------------------------------------------- |
| `aix install`                           | The `scope` field in `ai.json`. User scope if it has no field.  |
| `aix add <type> --save`                 | The `scope` field in `ai.json`. User scope if it has no field.  |
| `aix remove <type> --save`              | The `scope` field in `ai.json`. User scope if it has no field.  |
| `aix search`, when it installs a result | The `scope` field in `ai.json`. User scope if it has no field.  |
| `aix add <type>` without `--save`       | User scope. No `ai.json` is read.                               |
| `aix remove <type>` without `--save`    | User scope. No `ai.json` is read.                               |
| `aix install <source> --type <type>`    | Project scope.                                                  |
| `aix sync`                              | User scope, for both the editor it reads and the one it writes. |
| `aix list`                              | User scope.                                                     |

Every command that reads an `ai.json` resolves its scope the same way: a scope flag, then the
`scope` field, then user scope.

`aix install`, `aix add`, `aix remove`, and `aix list` take the same three flags:

- `--scope user` or `--scope project`
- `--user` (`-u`), which is short for `--scope user`
- `--project` (`-p`), which is short for `--scope project`

Only one of the three can be passed at a time. `aix list` also takes `--all`, which reads both
scopes. `aix sync` takes `--scope` (`-s`) for both editors, or `--from-scope` and `--to-scope`
to set them separately.

### `aix install`

`aix install` picks its scope in this order:

1. A scope flag on the command line.
2. The [`scope` field](/configuration/ai-json-reference/#scope) in `ai.json`.
3. User scope.

Before it writes anything, the command prints the scope it chose:

```text
Installing to user scope: editor config in your home directory. Pass --project to keep it in this project
```

```text
Installing to project scope: editor config in /path/to/project
```

Every line of install output, and of `--dry-run` output, then shows the path it refers to.
Paths under the working directory start with `./` and paths under your home directory start
with `~/`, so a change to your home directory is visible before you run the install for real.

`aix init` records the scope you pass it. `aix init --project` writes `"scope": "project"` into
the new `ai.json`, and `aix init --user` writes `"scope": "user"`. With no scope flag it writes
no `scope` field, and `aix install` then uses user scope unless you pass `--project`. To make an
existing `ai.json` install into the project by default, add the field yourself:

```json
{
   "scope": "project"
}
```

### `aix add` and `aix remove`

Without `--save`, `aix add` and `aix remove` read no `ai.json`, so they work at user scope
unless you pass `--project` or `--scope project`. With `--save` they load `ai.json` and follow
its `scope` field the way `aix install` does.

`aix remove` only looks at the scope it resolved. An item installed at project scope is not
removed by an `aix remove` that runs at user scope.

## What an install skips

An editor does not always have a file for every feature at both scopes. aix does not write
the item somewhere else in that case. It skips the item and says so in the output.

### At project scope

Windsurf and Codex read <abbr class="aix-term" title="Model Context Protocol">MCP</abbr>
servers only from a user-scope file (`~/.codeium/windsurf/mcp_config.json` and
`~/.codex/config.toml`). A project-scope `aix install` leaves those files alone and lists
each server as skipped:

```text
  Global MCP
    - playwright (Requested target scope is project, so aix did not write global-only config)
```

A project-scope install also skips hooks, plugins, and marketplaces for an editor that has no
project-scope file for them, and prints a warning that names what it skipped.

`aix sync` with a project destination scope skips the same items.

`aix add --project` and `aix remove mcp --project` follow the same rule. To add or remove a
Windsurf or Codex MCP server, run the command at user scope.

### At user scope

- Cursor, GitHub Copilot, and Grok CLI have no user-scope rules file that aix writes, so a
  user-scope install skips rules for them and prints a warning.
- An editor with no user-scope file for hooks, plugins, or marketplaces gets a warning that
  names the skipped items.
- Windsurf and Codex MCP servers are not written when aix detects a CI environment.

## Using another directory as home

User scope means the home directory. To make aix treat another directory as home, pass
`--user-home <dir>` to any command or set the `AIX_USER_HOME` environment variable. Every
user-scope path, including `~/.aix/` and its backups, then resolves under that directory.
Project scope is not affected.

This is the way to try a user-scope command without touching your real editor config. See
[Using an alternate home directory](/cli/overview/#using-an-alternate-home-directory).

## Related pages

- [What aix writes and where](/concepts/files-and-directories/)
- [Backups and restore](/concepts/backups-and-restore/)
- [`aix install`](/cli/install/)
