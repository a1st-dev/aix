---
sidebar:
   order: 80
title: Backups and restore
description: When aix backs up a file, where the backup goes, and how to restore it or undo an install.
---

Before aix changes or deletes a file that already exists, it copies the file into a backup
store under your home directory. `aix backups` lists the copies and `aix backups restore`
puts one back.

## When a backup is made

aix backs up a file immediately before it writes to it or deletes it. That covers:

- Editor config files that `aix install`, `aix add`, or `aix sync` update or delete.
- The editor config file that `aix remove mcp`, `aix remove hook`, `aix remove plugin`, or
  `aix remove marketplace` edits.
- `ai.json` and `ai.local.json`, when `--save` or `aix config set` edits them.
- The file that `aix backups restore` is about to replace.
- A rule, prompt, or agent file that `aix remove` deletes, and a skill directory that
  `aix remove skill` deletes. A directory is backed up as a directory and restored whole.
- The `ai.json` that `aix init --force` replaces.

No backup is made in these cases:

- A file that aix creates. There was nothing to copy, so undoing it means removing the file.
- A `--dry-run`, which writes nothing.
- aix's own copy of a skill under `.aix/skills/`, which the next install rebuilds from the
  skill's source.

## Where backups go

Every backup goes to one store, `~/.aix/backups/`, whichever scope or directory the command
ran in. Nothing is written beside the file that was edited.

Inside the store, a backup keeps the path of the file it came from:

- A file under your home directory is stored under `home/`, followed by its path relative to
  home.
- Any other file is stored under `root/`, followed by its absolute path.

The file name gets the time of the backup in UTC and a `.backup` suffix.

| Original file             | Backup                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| `~/.claude.json`          | `~/.aix/backups/home/.claude.json.2026-01-15T10-30-00-000Z.backup`          |
| `~/code/my-app/.mcp.json` | `~/.aix/backups/home/code/my-app/.mcp.json.2026-01-15T10-30-00-000Z.backup` |
| `/srv/my-app/.mcp.json`   | `~/.aix/backups/root/srv/my-app/.mcp.json.2026-01-15T10-30-00-000Z.backup`  |

With `--user-home <dir>` or `AIX_USER_HOME`, the store is `<dir>/.aix/backups/`, and `home/`
means that directory. See
[Using an alternate home directory](/cli/overview/#using-an-alternate-home-directory).

## List backups

```bash
aix backups
```

The command lists the whole store, newest first, from any directory. Each row shows the
original file, the date of the backup, its size, and the backup file. `--json` prints the
same list as an array of `{ path, originalPath, backupDate, size }` objects.

## Restore a file

Pass a backup file from the list to `aix backups restore`:

```bash
aix backups restore ~/.aix/backups/home/.claude.json.2026-01-15T10-30-00-000Z.backup
```

aix asks for confirmation, then copies the backup over the file it was taken from. It backs
up the file it replaces first, so a restore can be undone by restoring that newer backup.

- `--yes` (`-y`) skips the confirmation. Without a terminal, the command fails unless you
  pass it.
- `--to <path>` restores to another path and leaves the original file alone.

## How long backups are kept

- aix keeps the five newest backups of each file, or as many as
  [`aix.cache.maxBackups`](/configuration/ai-json-reference/#aix) says. Older ones are deleted when a new backup
  of that file is made.
- After an `aix install` that succeeds for every editor, aix deletes backups older than
  `aix.cache.maxBackupAgeDays`. The default is 30 days.

```json
{
   "aix": {
      "cache": {
         "maxBackupAgeDays": 30
      }
   }
}
```

`aix cache clear` and `aix install --clean` do not touch backups. To delete backups yourself,
remove files from `~/.aix/backups/`.

## Undo an install

An install changes some files that already existed and creates others. Undoing it takes one
step for each kind.

1. List the backups and find the ones taken at the time of the install:

   ```bash
   aix backups
   ```

2. Restore each file the install changed:

   ```bash
   aix backups restore <backup file>
   ```

3. Remove what the install added. Files that aix created have no backup, so restoring does
   not remove them. Either remove the items by name:

   ```bash
   aix remove skill <name>
   aix remove rule <name>
   ```

   or take the items out of `ai.json` and install again. An install removes the entries and
   generated files that it wrote earlier and that the config no longer declares:

   ```bash
   aix install
   ```

Use the same scope flag for the removal that the install used. An install at user scope is
not undone by `aix remove --project`.

To see what an install would change before running it, use `aix install --dry-run`.

## Related pages

- [`aix backups`](/cli/backups/)
- [What aix writes and where](/concepts/files-and-directories/)
- [User scope and project scope](/concepts/scopes/)
