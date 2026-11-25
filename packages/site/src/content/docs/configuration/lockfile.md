---
sidebar:
   order: 5
title: ai.lock.json
description: What the lockfile records, how to create and refresh it, and what aix does when it is out of date.
---

`ai.lock.json` is an optional file beside `ai.json`. It records a hash of the resolved config
and a hash of each item the config installs. When the file exists, aix compares it with the
config every time it loads `ai.json`, and stops if the two disagree.

Use it when a change to the config must be reviewed before it reaches editors. An edit to
`ai.json`, to a file it refers to, or to the content of a remote source then fails the next
command until someone refreshes the lockfile.

The lockfile only detects changes. aix does not read versions from it, and does not use it to
download an earlier copy of a remote source.

## What it records

The file is JSON. It has a `lockfileVersion`, which is `1`, a `config` object, and an
`entities` object.

`config` is a hash of the resolved config: `ai.json` after `extends` is applied. It covers
every field, including `scope`, `plugins`, and `marketplaces`. It does not cover
[`ai.local.json`](#the-lockfile-and-ailocaljson).

`entities` has one entry for each item, grouped by section and keyed by name. Every entry has
a `name`, a `section`, a SHA-256 `digest`, a SHA-512 `integrity` string, and a `size` in
bytes. What the entry hashes depends on the section:

- **Skills**: every file in the resolved skill directory. The entry lists each file with its
  own path, digest, integrity string, and size.
- **Rules, prompts, and agents**: the content aix loaded, whether it comes from inline text,
  a local file, a git repository, or an npm package, and the metadata that goes with it.
- **MCP servers, hooks, and editors**: the entry as it appears in the resolved config.
- **`aix`**: one entry named `settings` for the whole `aix` field.

An entry also stores the `source` it has in the config and, for items read from a file, the
`resolved` location. Entries set to `false` are not recorded. Plugins and marketplaces have
no entries of their own. The `config` hash covers them.

The file has no timestamp, so refreshing the lockfile of an unchanged config writes the same
content.

## Create and refresh the lockfile

| Command                                  | What it does                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `aix validate --lock`                    | Validates `ai.json`, then writes the lockfile. Editors are not changed. |
| `aix init --lock`                        | Creates `ai.lock.json` together with the new `ai.json`.                 |
| `aix install --lock`                     | Writes the lockfile, then installs.                                     |
| `aix add <type> <source> --save --lock`  | Adds the item to `ai.json`, then writes the lockfile.                   |
| `aix remove <type> <name> --save --lock` | Removes the item from `ai.json`, then writes the lockfile.              |

A command with `--lock` does not compare the config with the existing lockfile. It replaces
the lockfile with one that matches the current config.

`--lock` has these limits:

- `aix install --lock --dry-run` writes no lockfile.
- `aix install <source> --lock` requires `--save`, because the lockfile belongs to a local
  `ai.json`. `aix install --type` rejects `--lock`.
- `aix add` and `aix remove` reject `--lock` without `--save`, and `--lock` combined with
  `--local`. `aix add --save --lock` also fails when there is no `ai.json` yet.

### Automatic refresh

When `ai.lock.json` already exists, these commands refresh it after they change `ai.json`,
with or without `--lock`:

- [`aix add`](/cli/add/) with `--save`
- [`aix remove`](/cli/remove/) with `--save`
- [`aix config set`](/cli/config/#aix-config-set)
- [`aix install <source>`](/cli/install/) with `--save`

aix does not notice an edit you make by hand. Run `aix validate --lock` after you edit
`ai.json` or a file it refers to.

aix reads and writes a lockfile only beside a config file named `ai.json`. A config stored in
the `ai` field of `package.json`, or a file with another name passed to `--config`, has no
lockfile, and `aix validate --lock` fails for it. `aix install <source>` does not look for a
lockfile beside the source.

## When ai.json and the lockfile disagree

Each command that loads `ai.json` checks the lockfile as part of loading: `aix install`,
`aix validate`, `aix config`, and `aix add` or `aix remove` with `--save`. If a hash differs,
the command stops with a non-zero exit status before it changes any editor config.

The error names the file, says how to refresh it, and lists the differences:

```text
✗ Configuration Error

  File: ai.lock.json
  ai.lock.json is stale. Run `aix validate --lock` or the command you were using with `--lock` to refresh it.

  ● config.digest
    Expected sha256:<hash of the config now>, found sha256:<hash in the lockfile>
```

| Difference                         | Meaning                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `config.digest`                    | The resolved config changed: `ai.json` or a config it extends.                             |
| `entities.<section>.<name>.digest` | The config is the same, but the content of that item changed, such as an edited rule file. |
| `entities.<section>.<name>`        | The item is `Missing from ai.lock.json`, or it is `No longer present in resolved ai.json`. |

To continue, review what changed, then refresh the lockfile:

```bash
aix validate --lock
```

Passing `--lock` to the command that failed has the same effect, for the commands that accept
it. A lockfile that is not valid JSON, or that does not match the lockfile schema, also stops
the command. Refresh it the same way.

## Commit the lockfile

Commit `ai.lock.json` together with `ai.json`, and commit the refreshed lockfile in the same
change as the edit that made it stale. A reviewer then sees which items changed, and a
checkout whose files do not match the lockfile fails instead of installing.

In a CI job, run `aix validate` without `--lock`. It exits with a non-zero status when the
lockfile is out of date. See [Use aix in CI and scripts](/getting-started/ci-and-scripts/).

## The lockfile and ai.local.json

The lockfile describes the config before [`ai.local.json`](/configuration/ai-local-json/) is
merged in. `ai.local.json` is not committed, so a lockfile that covered it would match only on
the machine that wrote it.

- A lockfile written on a machine that has an `ai.local.json` is the same as one written
  without it.
- Editing `ai.local.json` does not make the lockfile out of date, and the items it adds are
  installed without a lockfile check.
- `aix add` and `aix remove` do not refresh the lockfile when they write `ai.local.json`,
  and reject `--lock` combined with `--local`.

## Paths in the lockfile

An entry for a skill, rule, prompt, or agent that aix reads from a file stores the path of
that file, and the path is part of the entry's hash. The path is relative to the directory of
`ai.json`, including for a file outside that directory, such as `../shared/style.md`. The
lockfile therefore matches in any checkout that has the same layout. An entry for a skill
from a git repository stores no path, because aix downloads it into the temporary directory
of the operating system.

Earlier versions of aix hashed `ai.local.json` and stored absolute paths. Run
`aix validate --lock` once to refresh a lockfile written by one of those versions.
