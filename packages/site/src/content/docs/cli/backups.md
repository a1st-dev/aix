---
sidebar:
   order: 12
title: aix backups
description: List the backups aix made before changing files, and restore one.
---

Before aix changes or deletes a file that already exists, it copies the file into one backup
store, `~/.aix/backups/`. `aix backups` lists the store and `aix backups restore` copies a
backup back.

[Backups and restore](/concepts/backups-and-restore/) explains when a backup is made, how
the store is laid out, and how to undo an install.

## Commands

### `aix backups`

```bash
aix backups
```

Lists every backup in the store, newest first. The list is the same from any directory. For
each backup it shows the original file, the date of the backup, its size, and the backup
file.

With `--json`, the command prints an array with one entry per backup:

```json
[
   {
      "path": "/Users/me/.aix/backups/home/.claude.json.2026-01-15T10-30-00-000Z.backup",
      "originalPath": "/Users/me/.claude.json",
      "backupDate": "2026-01-15T10:30:00.000Z",
      "size": 2048
   }
]
```

### `aix backups restore`

```bash
aix backups restore <backup file> [flags]
```

Copies a backup over the file it was taken from. `<backup file>` is a path from the
`Backup File` column of `aix backups`.

Before it replaces the file, aix backs up the current version, so you can undo a restore by
restoring that newer backup.

| Flag           | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `--to <path>`  | Restore to this path instead of the file the backup was taken from.  |
| `--yes` / `-y` | Skip the confirmation. Required when there is no terminal to ask on. |

```bash
# Put ~/.claude.json back the way it was
aix backups restore ~/.aix/backups/home/.claude.json.2026-01-15T10-30-00-000Z.backup

# Look at an old version without replacing the current file
aix backups restore ~/.aix/backups/home/.claude.json.2026-01-15T10-30-00-000Z.backup --to ./claude.old.json
```

## Where backups are stored

A backup keeps the path of the file it came from, with the time of the backup and a `.backup`
suffix added:

- `~/.aix/backups/home/<path relative to your home directory>` for a file under your home
  directory.
- `~/.aix/backups/root/<absolute path>` for any other file.

Nothing is written beside the file that was edited.

## Retention

aix keeps the five newest backups of each file. After an `aix install` that succeeds, it also
deletes backups older than `aix.cache.maxBackupAgeDays`, which is 30 days unless `ai.json`
sets it:

```json
{
   "aix": {
      "cache": {
         "maxBackupAgeDays": 30
      }
   }
}
```

`aix cache clear` and `aix install --clean` do not delete backups.
