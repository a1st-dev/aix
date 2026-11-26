---
sidebar:
   order: 6
title: Troubleshooting
description: Messages aix prints and results you may not expect, with the cause and the fix for each.
---

Each entry on this page starts from a message aix prints or from a result that differs from
what you expected. Parts of a message in angle brackets, such as `<editor>`, stand for a
value from your own run.

## Check what aix will do

These commands change no editor config:

```bash
# Check ai.json, ai.local.json, extended configs, and the lockfile
aix validate

# Print the config after extends and ai.local.json are applied
aix config show --resolved

# Print every file an install would change, with its path
aix install --dry-run
```

To run a user-scope command for real without touching your home directory, pass
`--user-home <dir>`. See
[Using an alternate home directory](/cli/overview/#using-an-alternate-home-directory).

## Config files

### No ai.json found

```text
No ai.json found. Run `aix init` to create one.
```

`aix install`, `aix validate`, and `aix config` look for `ai.json` in the working directory
and then in each parent directory. A `package.json` with an `ai` field also counts. The
message means that none was found, or that the path passed to `--config` does not exist.

Run the command from inside the project, pass `--config <path>`, or create the file with
[`aix init`](/cli/init/).

### ai.json already exists

```text
ai.json already exists. Use --force to overwrite.
```

`aix init` does not replace an existing `ai.json`. With `--force` it backs up the old file and
writes a new one. To add items to the existing file, use [`aix add`](/cli/add/) with `--save`.

### A config file is invalid

A config that does not match the schema stops every command that loads it. The message is
one of these:

```text
Invalid ai.json configuration:
  - <field>: <problem>
```

```text
✗ Configuration Error

  File: ai.local.json
  Validation failed

  ● <field>
    <problem>
```

The second form names the file that has the problem: `ai.local.json` or `ai.lock.json`.
`aix validate` prints each field and its problem on one line.

A file that is not valid JSON gives `Failed to parse <path>:` followed by the parser's
message. `<path>` is the file with the syntax error.

Fix the field that the message names. `ai.local.json` does not accept `extends`, and reports
`extends is not allowed in ai.local.json`. The
[ai.json reference](/configuration/ai-json-reference/) lists the valid fields.

### The lockfile is out of date

```text
ai.lock.json is stale. Run `aix validate --lock` or the command you were using with `--lock` to refresh it.
```

The message is followed by one line for each difference, such as `config.digest` or
`entities.rules.<name>.digest`.

The project has an `ai.lock.json`, and the resolved config no longer matches it. Either
`ai.json` changed, or a file or remote source it refers to changed. A lockfile written by an
earlier version of aix can also be reported as out of date once. Review the change, then
refresh the lockfile:

```bash
aix validate --lock
```

See [ai.lock.json](/configuration/lockfile/#when-aijson-and-the-lockfile-disagree).

## Nothing was installed

### No editor was detected

`aix install` prints:

```text
No editors detected, so nothing was installed. Pass --target <editor>, or list editors under "editors" in ai.json.
```

`aix add` prints:

```text
Not installed to any editor: none was detected. Pass --target <editor> to choose one.
```

aix detects an editor by looking for its config or data directory under your home directory.
With `--user-home` or `AIX_USER_HOME` it looks under that directory instead. When it finds
none and you named none, it installs nothing and exits with a non-zero status. `aix add` with
`--save` is the exception: it has written the item to the config file, so it prints the
message as a warning and exits with status 0.

Pass `--target <editor>` for each editor, or list the editors in the
[`editors` field](/configuration/ai-json-reference/#editors) of `ai.json`. The accepted names
are under [Editor names](/cli/overview/#editor-names).

### An item was skipped

An install can succeed for an editor and still leave some items out. The output says which.

```text
<editor> cannot write rules at user scope. Skipped: <names>
```

The editor has no file for that feature at the scope of the install. The same message exists
for skills, hooks, plugins, and marketplaces. Cursor and Grok CLI have no
user-scope rules file that aix writes, so install rules for them with `--project`.

```text
<editor> does not support prompts. Skipped: <names>
```

The editor has no equivalent for that feature at any scope. The same message exists for
<abbr class="aix-term" title="Model Context Protocol">MCP</abbr> servers, hooks, custom
agents, plugins, and marketplaces. The page of each editor under
[Supported editors](/editors/supported-editors/) lists what it supports.

```text
  Global MCP
    - <server> (Requested target scope is project, so aix did not write global-only config)
```

The aix Windsurf and Codex targets write MCP servers at user scope. Install those servers
at user scope. In a CI environment the reason is
`Skipped in CI environment`, and aix does not write these servers at either scope. See
[What an install skips](/concepts/scopes/#what-an-install-skips) and
[Use aix in CI and scripts](/getting-started/ci-and-scripts/#what-aix-skips-in-ci).

## The wrong scope

### The install wrote to the home directory

```text
Installing to user scope: editor config in your home directory. Pass --project to keep it in this project
```

`aix install` uses user scope unless you pass a scope flag or `ai.json` has a `scope` field.
`aix add`, `aix remove`, and `aix sync` also default to user scope.

To install into the project, pass `--project`, or add `"scope": "project"` to `ai.json` so
that every later install uses it. To take back the user-scope install, follow
[Undo an install](/concepts/backups-and-restore/#undo-an-install).
[User scope and project scope](/concepts/scopes/) has the full rules.

### aix remove does not find the item

```text
No rule named "<name>" found at user scope in: <editors>
```

`aix remove` looks at one scope only, and without `--save` that scope is user scope. An item
that was installed at project scope is not found. Run the command again with `--project`.

## Flags that are rejected

| Message                                                                                     | Cause                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--local requires --save because no config file is changed otherwise.`                      | `aix add` or `aix remove` got `--local` without `--save`.                                       |
| `--lock requires --save because no ai.json is changed otherwise.`                           | `aix add` or `aix remove` got `--lock` without `--save`.                                        |
| `--config-only requires --save; otherwise the command would make no change.`                | `aix add` or `aix remove` got `--config-only` without `--save`.                                 |
| ``--lock requires a local ai.json. Run `aix init` first, or omit --lock.``                  | `aix add --save --lock` found no `ai.json` to write a lockfile for.                             |
| `--lock cannot be combined with --local because ai.lock.json does not cover ai.local.json.` | `aix add` or `aix remove` got both flags.                                                       |
| `--user=true cannot also be provided when using --scope`                                    | `--scope` was combined with `--user`. `--project` gives the same message with `--project=true`. |
| `--overwrite only applies to the ai.json that --save writes. Pass --save as well.`          | `aix install` got `--overwrite` without `--save`. `--copy` has the same rule and message.       |
| `--save requires a remote source argument (URL, git shorthand, or path)`                    | `aix install --save` got no `source`.                                                           |
| `--lock with a remote source requires --save so aix has a local ai.json to lock`            | `aix install <source> --lock` got no `--save`.                                                  |
| `Direct installs require --target <editor>`                                                 | `aix install --type` got no `--target`.                                                         |
| `Expected --target=<name> to be one of: ...`                                                | The editor name is not one aix accepts. See [Editor names](/cli/overview/#editor-names).        |

## A command stops because there is no terminal

```text
This command needs an answer, and there is no interactive terminal to ask on. Pass --yes to confirm.
```

`aix remove` and `aix backups restore` ask for confirmation. In a script, a CI job, or any
run where standard input is not a terminal, nobody can answer, so the command fails. Pass
`--yes`.

```text
This command needs an answer, and there is no interactive terminal to ask on. Several editors were detected (<editors>). Pass --target for each one to install to, or list them under "editors" in ai.json.
```

`aix install` found more than one editor and cannot ask which ones to use. Pass `--target`, or
list the editors in `ai.json`. `aix add mcp <name>` fails the same way when several MCP
Registry servers match the name. Pass `--command` or `--url` to define the server yourself.

[Use aix in CI and scripts](/getting-started/ci-and-scripts/) covers the other flags to pass
in a run without a terminal.

## The install fails for one editor

When an install fails for an editor, aix prints `Failed to install to <editor>` with the
reason, continues with the other editors, and exits with a non-zero status.

### An editor config file does not parse

```text
Cannot merge <path>: existing content is not a valid JSON object. Fix the file before installing.
```

```text
Cannot merge invalid global config: <path>
```

```text
Cannot reconcile invalid editor config: <path>
```

aix merges its entries into the settings file an editor already has. It does not replace a
file that it cannot parse, because that would delete your own settings. Open the file at
`<path>` and fix the syntax error. Comments and trailing commas in a JSON file are accepted.

If an earlier version of the file was valid, [`aix backups`](/cli/backups/) may list a copy of
it.

### A skill directory already exists

```text
Cannot install skill "<name>": <path> already exists and was not created by aix. Move or delete it, then install again.
```

aix installs a skill as a link from the editor's skill directory to its own copy of the
skill. The editor already has a directory with that name which aix did not create, so aix
leaves it alone. Move or delete the directory at `<path>`, or give the skill in `ai.json`
another name, then install again.

### An install receipt is damaged

```text
Invalid install receipt: <path>. Delete that file to continue. aix will then leave what that install wrote in place and treat it as yours.
```

aix records what each install wrote in a receipt file under `.aix/installs/` in the project,
or `~/.aix/installs/` for user scope. The file at `<path>` cannot be read as a receipt, and
aix does not guess its contents.

Delete the file. The entries that the install wrote stay in the editor config, and aix no
longer removes them when they leave `ai.json`. Remove the ones you do not want with
[`aix remove`](/cli/remove/) or by hand.

## A git source changed, but the install writes the old content

aix keeps the rule, prompt, and agent files it downloads from git repositories in `.aix/.tmp/`
in the project, and reuses them on the next install. To download them again, clear the cache
as part of the install:

```bash
aix install --clean
```

`aix cache clear` deletes the same directory without installing. It prints `Cache is empty.`
when there is nothing to delete. After an install that succeeds for every editor, aix also
deletes cache entries older than `aix.cache.maxCacheAgeDays`, which is 7 days by default. See
[`aix cache`](/cli/cache/).

## Undo a change

Before aix changes or deletes a file that already exists, it copies the file to
`~/.aix/backups/`. List the copies, then restore the one you need:

```bash
aix backups
aix backups restore <backup file>
```

`<backup file>` is a path from the `Backup File` column of the list. The restore asks for
confirmation unless you pass `--yes`, and backs up the file it replaces.

```text
Cannot tell which file <backup file> is a backup of. Pass --to <path> to choose where to restore it.
```

The path is not a backup in the store. Copy the path from the output of `aix backups`, or
pass `--to <path>` to restore the file to a location you choose.

A file that aix created has no backup, so a restore does not remove it. Remove such items
with [`aix remove`](/cli/remove/) at the scope they were installed at.
[Backups and restore](/concepts/backups-and-restore/) describes how to undo a whole install.
