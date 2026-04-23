---
slug: cli/sync
sidebar:
   order: 4
title: aix sync
description: Copy supported configuration from one editor to another.
---

Reads supported config from one editor, normalizes it through aix's internal bridge format,
then installs what the destination editor can represent.

This command is for `editor -> editor` migration. If you want to apply `ai.json`, use
[`aix install`](/cli/install/). If you want to create `ai.json` from an editor, use
[`aix init --from`](/cli/init/).

## Usage

```bash
aix sync <from> --to <to> [flags]
```

`from` and `to` must be different supported editors.

## Flags

| Flag                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `--to <editor>` / `-t`   | Destination editor.                                  |
| `--scope <scope>` / `-s` | Apply the same scope to both source and destination. |
| `--from-scope <scope>`   | Scope to read from on the source editor.             |
| `--to-scope <scope>`     | Scope to write to on the destination editor.         |
| `--dry-run` / `-d`       | Preview changes without writing files.               |

Supported scope values are `user` and `project`.

If you do not pass any scope flags, sync defaults to `user` for both read and write.

## Examples

**Sync user-level config from Cursor to Claude Code:**

```bash
aix sync cursor --to claude-code
```

**Sync project-level config from Cursor to Zed:**

```bash
aix sync cursor --to zed --scope project
```

**Read project config but write user config:**

```bash
aix sync opencode --to windsurf --from-scope project --to-scope user
```

**Preview what would change:**

```bash
aix sync cursor --to codex --dry-run
```

## What sync does

1. Reads supported config from the source editor.
2. Converts that data into aix's normalized bridge format.
3. Installs the normalized config to the destination editor.
4. Reports anything the destination could not represent.

That bridge format is the whole point. aix does not need a custom converter for every source
and destination pair.

## Partial syncs and skipped writes

Some editors simply cannot represent every feature from every other editor. Sync does not turn
that into a hard failure.

Instead, aix calls out what was skipped and why. Two common reasons:

- The destination editor does not support that feature at all.
- The destination editor supports it, but not at the requested scope.

Examples:

- Codex converts prompts into skills instead of installing native prompts.
- Zed exposes skills through pointer rules, not native skill files.
- Windsurf and Codex still have global-only paths for some MCP writes, so a project-scoped sync
  will skip those writes and say so.

## Output expectations

The command summary includes:

- what aix imported from the source editor
- which destination files changed
- global-only changes that were applied or skipped
- warnings for unsupported destination features
- warnings for target-scope limitations

Those limitation warnings are informational. They tell you what did not make the trip.
