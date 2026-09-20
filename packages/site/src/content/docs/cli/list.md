---
sidebar:
   order: 8
title: aix list
description: List configured or installed AI configuration items.
---

Display the configuration that is actually installed in detected editors. The default scope is
`user`; `ai.json` is optional and is not the source of the listing.

## Usage

```bash
aix list [subcommand]
```

## Commands

- `aix list:skills` (or `aix list --only skills`): Show configured skills.
- `aix list:mcp` (or `aix list --only mcp`): Show configured MCP servers and their status.
- `aix list:rules` (or `aix list --only rules`): Show active rules and activation modes.
- `aix list:prompts` (or `aix list --only prompts`): Show configured prompts.
- `aix list:agents` (or `aix list --only agents`): Show configured agents, their modes, models, and references.
- `aix list:hooks` (or `aix list --only hooks`): Show configured hooks, their matchers, and what each one runs.
- `aix list:plugins` (or `aix list --only plugins`): Show installed plugins.
- `aix list:marketplaces` (or `aix list --only marketplaces`): Show registered plugin marketplaces.
- `aix list:editors` (or `aix list --only editors`): Show detected/configured editors.

## Flags

| Flag                                                     | Description                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--only <field>`                                         | Filter by section: `rules`, `prompts`, `mcp`, `skills`, `agents`, `hooks`, `plugins`, `marketplaces`, `editors`. Repeatable. |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Select user or project editor config. The default is user.                                                                   |
| `--all`                                                  | List both user and project editor config.                                                                                    |
| `--target <name>` / `-t`                                 | Limit output to specific editors. Repeatable.                                                                                |
| `--json`                                                 | Output as JSON.                                                                                                              |

Every list command scans native editor files. This includes items installed by hand or another
tool, symlinked skills, MCP servers, rules, prompts, agents, hooks, plugins, and marketplaces.
Section subcommands use the same rows and JSON schema as `aix list`; they only filter `type`.

`aix list --all` reports hooks alongside the other item types, listed by event name.

Every item is marked `aix` or `external`. `aix install`, `aix add`, and `aix sync` record
what they wrote in `.aix/state.json` (or `~/.aix/state.json` for user scope), and anything
found in an editor's config that is not in that record is `external` — put there by hand or
by another tool. Dropping an item from `ai.json` and installing again stops it being
tracked, so it shows as `external` until you remove it from the editor too. Text output uses
green for aix-managed sources, blue for external sources, yellow for disabled items, magenta
for item types, and cyan for names.
