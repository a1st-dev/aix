---
sidebar:
   order: 4
title: Use aix in CI and scripts
description: Run aix without a terminal, choose editors and scope explicitly, and read its exit status and JSON output.
---

aix runs the same way in a script or a CI job as it does on your machine, with two
differences: it cannot ask questions, and in CI it skips one kind of user-scope write. This
page lists what to pass so that a run without a terminal does what you expect.

## Choose the editors

A CI runner usually has no editor installed, and aix detects editors by looking for their
directories under the home directory. Name the editors yourself, with `--target` or with the
[`editors` field](/configuration/ai-json-reference/#editors) of `ai.json`:

```bash
aix install --target claude-code --target cursor
```

Without either, the result depends on what aix detects:

- **No editor**: `aix install` fails with `No editors detected, so nothing was installed.`
  and a non-zero exit status.
- **One editor**: aix installs to it.
- **Several editors**: aix would ask which ones to use, so without a terminal the command
  fails.

## Choose the scope

The default scope does not change in CI. `aix install` uses the `scope` field of `ai.json` and
falls back to user scope, which is the home directory of the user that runs the job.
`aix add` and `aix remove` do the same with `--save`, and use user scope without it.
`aix sync` uses user scope.

To write into the checkout, pass `--project` or `--scope project`, or set `"scope": "project"`
in `ai.json`. Pass `--user` or `--scope user` to make a user-scope run explicit. Only one of
these flags can be passed at a time. `aix sync` takes `--scope`, `--from-scope`, and
`--to-scope` instead. See [User scope and project scope](/concepts/scopes/).

## Commands that ask a question

When standard input is not a terminal, a command that needs an answer fails instead of
waiting for input. The message starts with this sentence and then states what to pass:

```text
This command needs an answer, and there is no interactive terminal to ask on.
```

| Command                             | Question                          | What to pass                             |
| ----------------------------------- | --------------------------------- | ---------------------------------------- |
| `aix install`                       | Which of several detected editors | `--target`, or `editors` in `ai.json`    |
| `aix remove <type> <name>`          | Confirmation                      | `--yes`                                  |
| `aix backups restore <backup file>` | Confirmation                      | `--yes`                                  |
| `aix add mcp <name>`                | Which of several registry matches | `--command` or `--url`, or the full name |

## What aix skips in CI

aix treats the run as CI when the environment variable `CI` or `CONTINUOUS_INTEGRATION` is set
to any value other than `0` or `false`. GitHub Actions and most other CI services set `CI`.

In CI, aix does not add
<abbr class="aix-term" title="Model Context Protocol">MCP</abbr> servers to Windsurf or Codex.
Those two editors read MCP servers only from a user-scope file
(`~/.codeium/windsurf/mcp_config.json` and `~/.codex/config.toml`). `aix install` and
`aix sync` list each skipped server and print a warning:

```text
  Global MCP
    - playwright (Skipped in CI environment)
⚠ [codex] Skipped global mcp "playwright" - CI environment detected
```

`aix add mcp` prints the same warning. The skip does not change the exit status. At project
scope the same servers are skipped for a different reason, which
[User scope and project scope](/concepts/scopes/#at-project-scope) describes.

No other behavior of aix depends on CI detection.

## Exit status

- `aix install`, `aix add`, `aix remove`, and `aix sync` exit with a non-zero status when the
  command fails for any editor. `aix install` still works through the remaining editors
  first.
- `aix validate` exits with a non-zero status when `ai.json` is invalid, when no `ai.json` is
  found, or when `ai.lock.json` is out of date.
- `aix install` exits with a non-zero status when it detects no editor and you named none.
  `aix add` in the same situation prints a warning and exits with status 0.
- An item that aix skips, because the editor does not support it or does not accept it at the
  chosen scope, does not change the exit status.

## Output

`--quiet` (`-q`) suppresses progress messages, the list of changed files, and most warnings.
Error messages are still printed.

`--json` suppresses the normal output and prints one JSON document on standard output. For
`aix install` the document has a `results` array with one object per editor:

```json
{
   "dryRun": false,
   "sections": ["mcp"],
   "results": [{ "editor": "claude-code", "success": true, "changes": [], "errors": [] }]
}
```

Each entry in `changes` has the `path` of a file, an `action`, and usually the new `content`
of the file. That content can include values from the `env` and `headers` of an MCP server,
so do not print the document to a public log.

Check the exit status before you parse the output. Except for `aix validate`, a command that
stops with an error message prints no JSON document.

## Check the lockfile

If the project commits [`ai.lock.json`](/configuration/lockfile/), every command that loads
`ai.json` fails when the resolved config no longer matches it. `aix validate` runs the check
without changing any editor config. Do not pass `--lock` in CI: it rewrites the lockfile
instead of checking it.

## Use another home directory

`AIX_USER_HOME`, or `--user-home <dir>` on one command, makes aix resolve every user-scope
path under another directory, including `~/.aix/` and its backups:

```bash
AIX_USER_HOME=/tmp/aix-home aix install --user --target claude-code
```

The command prints `Using <dir> in place of your home directory`. Editor detection also looks
in that directory, so pass `--target`. See
[Using an alternate home directory](/cli/overview/#using-an-alternate-home-directory).

## Preview a run

`aix install --dry-run` and `aix sync --dry-run` print the changes with the path of each file
and write no editor config. Paths under the working directory start with `./` and paths under
the home directory start with `~/`.

## Example: GitHub Actions

This job fails when `ai.json` is invalid or the lockfile is out of date, then installs the
config into the checkout for Claude Code:

```yaml
jobs:
   aix:
      runs-on: ubuntu-latest
      steps:
         - uses: actions/checkout@v7
         - uses: actions/setup-node@v7
           with:
              node-version: 22
         - run: npm install -g @a1st/aix
         - run: aix validate
         - run: aix install --project --target claude-code
```
