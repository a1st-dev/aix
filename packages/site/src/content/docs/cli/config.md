---
sidebar:
   order: 10
title: aix config
description: Show which config files are in use, read or set values in ai.json, and manage update checks.
---

Reads and edits values in `ai.json` by dot-notation key, such as `mcp.github.env`.

For project configuration, these commands use the `ai.json` in the working directory or
a parent directory, or the file named by `--config`.

## Commands

### `aix config show`

```bash
aix config show
```

Prints the path of the `ai.json` in use, and the path of `ai.local.json` when it adds
overrides. It does not print the contents.

**Flags:**

- `--resolved`: Print the final merged config, after `extends` and `ai.local.json`
  have been applied.
- `--json`: Print the paths and the merged config as one JSON document.

### `aix config get`

```bash
aix config get <key>
```

Prints one value from the merged config, so the result includes values that come from
`extends` and `ai.local.json`. Objects and arrays are printed as JSON. The command fails if
the key does not exist.

```bash
aix config get mcp.github.env
aix config get rules
```

### `aix config set`

```bash
aix config set <key> <value>
```

Sets one value in `ai.json`. It never writes to `ai.local.json` or to an extended config.

- If `<value>` parses as JSON, it is stored as that JSON value, so `7` becomes a number and
  `'["cursor","zed"]'` becomes an array. Anything else is stored as a string.
- Missing parent objects in the key are created.
- aix checks the result against the `ai.json` schema and leaves the file unchanged if the
  check fails.
- aix backs up `ai.json` before it writes. See [`aix backups`](/cli/backups/).
- If `ai.lock.json` exists, it is refreshed.

```bash
aix config set aix.cache.maxBackupAgeDays 60
aix config set editors '["cursor","claude-code"]'
```

## Cache keys

`aix config get` and `aix config set` accept `cache.<name>` as a short form of
`aix.cache.<name>`. `aix config set cache.maxCacheAgeDays 14` writes
`aix.cache.maxCacheAgeDays`.

## Update checks

`checkForUpdates` is a user setting and defaults to `true`. Read or change it from any
directory:

```bash
aix config get checkForUpdates
aix config set checkForUpdates false
```

aix saves this preference in `~/.aix/settings.json`. See
[Update aix](/getting-started/installation/#update) for one-time checks.
