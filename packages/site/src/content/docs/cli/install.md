---
sidebar:
   order: 4
title: aix install
description: Apply ai.json configuration to editors.
---

Reads `ai.json` (and `ai.local.json`), resolves inheritance, and writes the result into the
config files of your editors.

This command starts from `ai.json`. If you want to copy supported config directly from one
editor to another, use [`aix sync`](/cli/sync/) instead.

You can also install a single item without a local `ai.json` by passing `--type`. See
[Direct installs](#direct-installs).

## Usage

```bash
aix install [source] [flags]
```

Without `source`, aix installs the `ai.json` it finds in the working directory or a parent
directory. `source` can be a path, a URL, or a git shorthand such as `github:org/repo` that
points at another `ai.json`. With `--type`, `source` is a single item instead.

Alias: `aix i`

## Scope

`aix install` picks user scope or project scope in this order:

1. A scope flag: `--scope user`, `--scope project`, `--user` (`-u`), or `--project` (`-p`).
2. The [`scope` field](/configuration/ai-json-reference/#scope) in `ai.json`.
3. User scope.

Before it writes, the command prints the scope it chose:

```text
Installing to user scope: editor config in your home directory. Pass --project to keep it in this project
```

```text
Installing to project scope: editor config in /path/to/project
```

The output of an install, and of `--dry-run`, shows the path of every change. A path under
the working directory starts with `./` and a path under your home directory starts with `~/`.

A project-scope install does not write config that an editor only accepts at user scope.
Today that is the MCP config of Windsurf and Codex. The output lists those servers as
skipped. See [User scope and project scope](/concepts/scopes/) for the details.

## Choosing editors

aix installs to the editors named by `--target`. Without `--target`, it uses the enabled
editors in the `editors` field of `ai.json`. If neither is set, aix detects the editors on
your machine:

- With one editor detected, aix installs to it.
- With several detected and a terminal to ask on, aix shows a checkbox. The first time, every
  detected editor is selected. After that, the editors this config was last installed to are
  selected.
- With several detected and no terminal, as in a script or a CI job, the command fails. The
  message names the detected editors and tells you to pass `--target` or to list editors in
  `ai.json`.
- With none detected, the command fails and installs nothing. Pass `--target`.

When you install from a `source` and the working directory has its own `ai.json`, the
`editors` field of that local file is used in place of the one in the source.

## What a repeated install removes

aix records each source config's contributions per editor under `.aix/installs/` in the
target scope (`~/.aix/installs/` for user scope). On the next install from that source,
entries and generated files that have left the config are removed from the editor too. An
editor that was dropped from the `editors` field has this config's entries removed from it.
Cleanup preserves other sources' contributions and direct user edits. Entries that predate
these receipts remain untracked; aix does not infer ownership from their paths.

`--only` reconciles just the selected sections. `--dry-run` previews cleanup without
changing editor files or receipts. Receipts are written with the corresponding editor
changes, so a failed file write does not advance the recorded install.

## Flags

| Flag                                                     | Description                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <editor>` / `-t`                               | Install to this editor only. Repeatable.                                                                                               |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Install at user scope or project scope. See [Scope](#scope).                                                                           |
| `--dry-run` / `-d`                                       | Print the changes without writing any file.                                                                                            |
| `--only <section>`                                       | Install only these sections: `rules`, `prompts`, `mcp`, `skills`, `agents`, `hooks`, `plugins`, `marketplaces`, `editors`. Repeatable. |
| `--lock`                                                 | Create or refresh `ai.lock.json` before installing.                                                                                    |
| `--clean`                                                | Clear the aix cache first, so remote sources are downloaded again. See [Clearing the cache](#clearing-the-cache).                      |
| `--save`                                                 | Save the config from `source` to `ai.json` in the working directory. See [Saving a remote config](#saving-a-remote-config).            |
| `--overwrite`                                            | With `--save`, replace the local `ai.json` with the remote config instead of merging into it.                                          |
| `--copy`                                                 | With `--save`, copy remote files to `.aix/imported/` instead of referring to them by git URL.                                          |
| `--type <type>`                                          | Install one `mcp`, `skill`, `rule`, `hook`, `prompt`, or `agent` directly. See [Direct installs](#direct-installs).                    |

These flags only apply together with `--type`:

| Flag                     | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `--name <name>` / `-n`   | Name for the item when aix cannot infer one.                          |
| `--ref <ref>` / `-r`     | Git branch, tag, or commit for a git source.                          |
| `--command <command>`    | Command for a stdio MCP server.                                       |
| `--args <args>`          | Comma-separated arguments for the MCP command.                        |
| `--env <vars>`           | Comma-separated `KEY=value` environment variables for the MCP server. |
| `--url <url>`            | URL of a remote Streamable HTTP MCP server.                           |
| `--header <header>`      | `KEY=value` HTTP header for a remote MCP server. Repeatable.          |
| `--description <text>`   | Description of a rule, prompt, or agent.                              |
| `--activation <mode>`    | Rule activation mode: `always`, `auto`, `glob`, or `manual`.          |
| `--globs <patterns>`     | Comma-separated glob patterns for a rule.                             |
| `--argument-hint <hint>` | Argument hint for a prompt.                                           |
| `--mode <mode>`          | Agent mode: `primary` or `subagent`.                                  |
| `--model <model>`        | Agent model.                                                          |
| `--tools <tools>`        | Comma-separated list of tools for an agent.                           |

The [global flags](/cli/overview/#global-flags) also apply. With `--json`, the command prints
one JSON document with the result for each editor.

## Saving a remote config

`--save` needs a `source`. It writes the config from that source to `ai.json` in the working
directory:

- If there is no local `ai.json`, aix creates one.
- If there is one, aix merges the remote config into it and backs up the file first.
- With `--overwrite`, aix replaces the local `ai.json` with the remote config.
- With `--only`, only the selected sections are saved.

For a config that comes from a git repository, the saved `ai.json` refers to the files in
that repository by git URL. `--copy` copies those files into `.aix/imported/` and refers to
them by path instead.

`--overwrite` and `--copy` only affect the `ai.json` that `--save` writes. They are rejected
without `--save`, and `--overwrite` never replaces an editor config file.

After saving, aix installs to editors only if you passed `--target` or the saved `ai.json`
has an `editors` field. Otherwise the command stops once `ai.json` is written. Run
`aix install` to install it.

`--lock` with a `source` requires `--save`, because aix needs a local `ai.json` to write
`ai.lock.json` beside. When `ai.lock.json` already exists beside the saved `ai.json`, `--save`
refreshes it whether or not you pass `--lock`. See [ai.lock.json](/configuration/lockfile/).

## Clearing the cache

`--clean` deletes `.aix/.tmp/` in the project before the config is loaded, so every remote
source is downloaded again. It does not delete anything else in `.aix/`, and it does not
delete backups. With `--dry-run` it does nothing. See [`aix cache`](/cli/cache/).

After an install that succeeds for every editor, aix also deletes cache entries older than
`aix.cache.maxCacheAgeDays` (7 by default) and backups older than `aix.cache.maxBackupAgeDays`
(30 by default).

## Direct installs

With `--type`, aix installs the one item named by `source` and does not read, create, or
change `ai.json`:

```bash
aix install ./skills/review --type skill --target claude-code
aix install ./rules/typescript.md --type rule --name typescript --target cursor
aix install ./prompts/review.md --type prompt --name review --target opencode --user
aix install ./hooks/pre-command.jsonc --type hook --target claude-code --user
```

- `--target` is required.
- The default scope is project scope. Pass `--user` for user scope.
- `--save`, `--lock`, and `--only` are rejected.

For `--type mcp`, a plain name is looked up in the
[MCP Registry](https://registry.modelcontextprotocol.io), and aix uses the first match that
has an npm package with stdio transport. Pass `--command` or `--url` to define the server
yourself. An `https://` source is treated as a remote Streamable HTTP endpoint:

```bash
aix install playwright --type mcp --target claude-code --user
aix install https://example.com/mcp --type mcp --name docs --target claude-code --user
```

## What an install leaves alone

- **Existing files are backed up.** Before aix changes or deletes a file that already exists,
  it copies the file to `~/.aix/backups/`. See
  [Backups and restore](/concepts/backups-and-restore/).
- **Editor config is merged.** aix adds, changes, or removes its own entries in a settings
  file and keeps the rest. Edits to `~/.codex/config.toml` and Grok CLI's `config.toml` keep
  the file's comments and formatting.
- **Skill directories aix did not create are not replaced.** If an editor already has a skill
  directory with the same name, the install fails for that editor with a message that names
  the path. Move or delete the directory, then install again.
- **Claude Code rules at user scope are separate files.** aix writes each rule to
  `~/.claude/rules/`. In `~/.claude/CLAUDE.md` it imports only the rules that are not limited
  to file patterns. A rule with `glob` activation is left for Claude Code to load when a
  matching file is in use.

[What aix writes and where](/concepts/files-and-directories/) describes these files in more
detail.

## Exit status

The command exits with a non-zero status when the install fails for any editor. It still
installs to the remaining editors first.

## Examples

**Install the local config:**

```bash
aix install
```

**Preview an install:**

```bash
aix install --dry-run
```

**Install into the project instead of your home directory:**

```bash
aix install --project
```

**Install only to GitHub Copilot:**

```bash
aix install --target copilot
```

**Install a remote config without saving it:**

```bash
aix install github:company/ai-config
```

**Save a remote config to the local `ai.json` and install it to Cursor:**

```bash
aix install github:company/ai-config --save --target cursor
```

**Install only MCP servers:**

```bash
aix install --only mcp
```

**Refresh the lockfile, then install:**

```bash
aix install --lock
```

**Download remote sources again:**

```bash
aix install --clean
```

## install vs sync

- `aix install` is `ai.json -> editor`
- `aix sync` is `editor -> aix bridge -> editor`

`install` applies the config in `ai.json`. `sync` copies the config one editor already has
into another editor.
