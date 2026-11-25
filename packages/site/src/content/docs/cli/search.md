---
sidebar:
   order: 8
title: aix search
description: Find skills and MCP servers, and install them from the results.
---

Searches the [skills.sh](https://skills.sh) library for skills and the
[official MCP Registry](https://registry.modelcontextprotocol.io) for MCP servers.

## Usage

```bash
aix search [query] [flags]
```

In a terminal, the command opens an interactive search. With `--plain` or `--json`, or when
its output is piped, it prints the results and exits. That mode needs a `query`.

## Interactive mode

```bash
aix search
aix search playwright
```

Type to change the query. The results update as you type.

| Key      | Action                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Up, Down | Move the selection.                                                     |
| Enter    | Install the highlighted item, or uninstall it if you just installed it. |
| Tab      | Switch between the Skills and MCP tabs.                                 |
| Esc      | Clear the query. With an empty query, exit.                             |
| `?`      | Show or hide the list of keys.                                          |

Only the arrow keys move the selection and only Enter installs. Space, `j`, and `k` are
ordinary characters and go into the query. When a search fails, the status line offers `r` to
try it again.

### Installing from the results

Installing needs an `ai.json` in the working directory or a parent directory. Without one,
aix prints a warning, and Enter installs nothing. Run [`aix init`](/cli/init/) first.

When you press Enter on a result, aix:

1. Saves the item to `ai.json`. A skill is saved as a reference to its repository path. An
   MCP server is saved as the server you highlighted, with the `npx` command for its npm
   package.
2. Installs that section of `ai.json` to the editors listed in its `editors` field, or to
   every detected editor when it lists none.

The install uses the scope in the `scope` field of `ai.json`, or user scope when the file
has no such field, the same as `aix install`.

An installed item gets a check mark. If no editor received the item, the install counts as
failed and the item gets no check mark. The entry stays in `ai.json`.

Pressing Enter on an item you installed in this session takes it out of `ai.json` again.
That does not always remove it from your editors. Check with [`aix list`](/cli/list/) and
use [`aix remove`](/cli/remove/) if it is still there.

When you exit, aix prints the items you installed.

## Flags

| Flag                      | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `--type <type>` / `-t`    | Search only `skills` or only `mcp`. Repeatable. The default is both.             |
| `--plain` / `-p`          | Print the results as text and exit.                                              |
| `--json`                  | Print the results as JSON and exit.                                              |
| `--registry <url>` / `-r` | Accepted, but it has no effect. Skills come from skills.sh, not an npm registry. |

## Plain and JSON output

```bash
aix search react --type skills --plain
aix search react --type skills --json
```

Plain output lists each result with its description. JSON output is an object with a
`skills` array, an `mcp` array, or both, depending on `--type`. When nothing matches, JSON
mode prints nothing.

To install a result from this mode, pass its name to [`aix add skill`](/cli/add/) or
[`aix add mcp`](/cli/add/).
