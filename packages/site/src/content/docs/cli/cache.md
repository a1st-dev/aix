---
sidebar:
   order: 11
title: aix cache
description: Clear the files aix downloaded and can download again.
---

aix keeps the git and npm sources it downloads in `.aix/.tmp/` inside the project, so that a
later install does not fetch them again. `aix cache clear` deletes that directory.

## Usage

```bash
aix cache clear
```

Alias: `aix cache clean`

The command deletes `.aix/.tmp/` beside the `ai.json` it finds, searching from the working
directory upward the way `aix install` does, so it works from any subdirectory of the project.
`--config` picks a different `ai.json`. Without an `ai.json`, it uses the working directory.
The next `aix install` downloads remote sources again.

It does not delete anything else:

- Skills in `.aix/skills/`, imported files in `.aix/imported/`, extended configs in
  `.aix/extends/`, and the install records in `.aix/installs/` and `.aix/state.json` stay.
- Backups in `~/.aix/backups/` stay. See [`aix backups`](/cli/backups/).
- Editor config is not touched.

If the cache holds no downloaded git or npm sources, the command prints `Cache is empty.` and
deletes nothing.

With `--json`, the command prints the number of bytes freed and the paths it deleted.

## Related

- `aix install --clean` clears the same directory before it loads the config. See
  [`aix install`](/cli/install/#clearing-the-cache).
- After each successful install, aix deletes cache entries older than
  `aix.cache.maxCacheAgeDays`, which is 7 days unless `ai.json` sets it.
- [What aix writes and where](/concepts/files-and-directories/) lists everything in `.aix/`.
