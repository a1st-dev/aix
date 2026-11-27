---
sidebar:
   order: 4
title: Migrate between editors
description: Copy your AI configuration to another editor with aix sync and convert it to the destination editor's native format.
---

Use `aix sync` to bring your AI configuration with you when you switch editors. It reads
the source editor’s files, converts the configuration, and writes it in the destination
editor’s native format. Your source configuration stays in place.

## Preview and run the migration

[Install aix](/getting-started/installation/), then pick the editor you use today and
the one you’re moving to. For example, preview a migration from Codex to Claude Code:

```bash
aix sync codex --to claude-code --dry-run
```

Review the imported items, destination file paths, and any warnings about settings that
won’t carry over. When the preview looks right, apply the migration:

```bash
aix sync codex --to claude-code
```

Open the destination editor and check that your skills, rules, and MCP servers are
available. aix backs up existing destination files before changing them. Use
[`aix backups`](/concepts/backups-and-restore/) to find and restore an earlier copy.

## Migrate project configuration

By default, sync reads and writes user configuration. Run it from your project root
with `--scope project` to migrate configuration for a single repository:

```bash
aix sync cursor --to claude-code --scope project --dry-run
```

Use `--from-scope` and `--to-scope` when the source and destination use different
[scopes](/concepts/scopes/). See the [`aix sync` command reference](/cli/sync/) for all flags.

## Check what carries over

Sync reads skills, rules, prompts, agents, hooks, and MCP servers. Each editor has its
own capabilities and config locations. Some settings use a different representation in
the destination, and sync reports items it skips.

The [migration guides](/editors/migrations/) compare features and paths for each pair.
Start with [Codex to Claude Code](/editors/migrations/how-to-migrate-from-codex-to-claude-code/)
or [Cursor to Claude Code](/editors/migrations/how-to-migrate-from-cursor-to-claude-code/).
