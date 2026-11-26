---
sidebar:
   order: 6
title: aix sync
description: Copy supported configuration from one editor to another.
---

Reads supported config from one editor and installs the supported equivalent into another.
It does not read or write `ai.json`.

This command is for `editor -> editor` migration. If you want to apply `ai.json`, use
[`aix install`](/cli/install/). If you want to create `ai.json` from an editor, use
[`aix init --from`](/cli/init/).

## Usage

```bash
aix sync <from> --to <to> [flags]
```

`from` and `to` must be different supported editors.

## Flags

| Flag                   | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `--to <editor>` / `-t` | Destination editor. Required. `--target` is accepted as well. |
| `--scope <scope>`      | Apply the same scope to both source and destination.          |
| `--from-scope <scope>` | Scope to read from on the source editor.                      |
| `--to-scope <scope>`   | Scope to write to on the destination editor.                  |
| `--dry-run` / `-d`     | Preview changes without writing files.                        |

Scope values are `user` and `project`. Without a scope flag, sync reads user scope and writes
user scope. `--from-scope` and `--to-scope` each take precedence over `--scope`. Project
scope means the editor config in the working directory. See
[User scope and project scope](/concepts/scopes/).

## Examples

**Sync user-scope config from Cursor to Claude Code:**

```bash
aix sync cursor --to claude-code
```

**Sync project-scope config from Cursor to Zed:**

```bash
aix sync cursor --to zed --scope project
```

**Read project scope but write user scope:**

```bash
aix sync opencode --to windsurf --from-scope project --to-scope user
```

**Preview what would change:**

```bash
aix sync cursor --to codex --dry-run
```

## What sync does

1. Reads MCP servers, rules, prompts, agents, skills, and hooks from the source editor at
   the source scope.
2. Installs the supported equivalent into the destination editor at the destination scope.
3. Reports anything the destination could not represent.

Existing files in the destination are backed up before they are changed. See
[`aix backups`](/cli/backups/).

## Partial syncs and skipped writes

Some editors cannot represent every feature of every other editor. Sync does not treat that
as a failure. It reports what was skipped and why. The two reasons are:

- The destination editor does not support that feature at all.
- The destination editor supports it, but not at the requested scope.

Examples:

- Codex converts prompts into skills instead of installing native prompts.
- Zed reads skills from the shared `.agents/skills/` folder rather than a Zed-specific one.
- The aix Windsurf and Codex targets write MCP servers at user scope, so a sync with a project
  destination scope skips those servers and says so.

## Output

The command summary includes:

- what aix imported from the source editor
- which destination files changed, with their paths
- config the destination only accepts at user scope, and whether it was written or skipped
- warnings for features the destination does not support
- warnings for features the destination does not accept at the requested scope

Those warnings are informational. They tell you what was not copied.

## Exit status

The command exits with a non-zero status when writing to the destination editor fails.
Skipped features do not change the exit status.
