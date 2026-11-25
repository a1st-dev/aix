---
sidebar:
   order: 7
title: aix list
description: List the AI configuration your editors hold.
---

Shows the configuration that is in your editors' own config files. The listing comes from
those files, not from `ai.json`, so it includes items you added by hand or with another tool.

## Usage

```bash
aix list [section] [flags]
```

Alias: `aix ls`

Without a section, the command lists every kind of item. It reads user scope unless you pass
a scope flag.

## Sections

Name a section after `aix list` to see only that kind of item:

- `aix list skills`: skills.
- `aix list mcp`: MCP servers. `aix list mcps` does the same.
- `aix list rules`: rules.
- `aix list prompts`: prompts.
- `aix list agents`: agents.
- `aix list hooks`: hooks, by event name.
- `aix list plugins`: plugins.
- `aix list marketplaces`: plugin marketplaces.
- `aix list editors`: the names of the editors that have any configuration at the chosen
  scope.

`aix list --only <section>` is the same filter as a flag, and it can be repeated to show
several sections.

## Flags

| Flag                                                     | Description                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--only <section>`                                       | Show only this section: `rules`, `prompts`, `mcp`, `skills`, `agents`, `hooks`, `plugins`, `marketplaces`, `editors`. Repeatable. |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Read user scope or project scope. The default is user scope.                                                                      |
| `--all`                                                  | Read both scopes. Cannot be combined with a scope flag.                                                                           |
| `--target <editor>` / `-t`                               | Show only this editor. Repeatable. `--editor` and `-e` are accepted as other names for this flag.                                 |
| `--json`                                                 | Print the listing as JSON.                                                                                                        |

Without `--target`, aix reads every supported editor. Project scope means the editor config
in the working directory.

## Output

Each row shows the item's type, scope, source, status, name, and path. The source is `aix` or
`external`:

- `aix` means aix installed the item. `aix install`, `aix add`, and `aix sync` record what
  they wrote in `.aix/state.json` (`~/.aix/state.json` for user scope).
- `external` means the item is in the editor's config and not in that record. It was put
  there by hand or by another tool.

Text output uses green for `aix` sources, blue for `external` sources, yellow for disabled
items, magenta for item types, and cyan for names.

### JSON output

`--json` prints one document. Section commands use the same shape and only filter `items`.
`aix list --target claude-code --json` prints a document like this:

```json
{
   "version": 1,
   "scope": "user",
   "targets": ["claude-code"],
   "items": [
      {
         "editor": "claude-code",
         "type": "mcp",
         "name": "playwright",
         "source": "aix",
         "status": "enabled",
         "scope": "user",
         "path": "/Users/me/.claude.json"
      }
   ],
   "warnings": []
}
```

`targets` lists the editors that were read, which is every supported editor without
`--target`. `scope` at the top level is `all` with `--all`. `aix list editors --json` adds an
`editors` array with the names of the editors that have configuration and leaves `items`
empty.

## Examples

```bash
# Everything at user scope
aix list

# Project-scope MCP servers
aix list mcp --project

# Rules and hooks at both scopes, for Codex only
aix list --all --only rules --only hooks --target codex
```
