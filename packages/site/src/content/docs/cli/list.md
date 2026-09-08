---
sidebar:
   order: 8
title: aix list
description: List configured or installed AI configuration items.
---

Display what is currently configured in your project. Items are labeled with their scope (user/project).

## Usage

```bash
aix list [subcommand]
```

## Commands

- `aix list skills`: Show configured skills.
- `aix list mcp`: Show configured MCP servers and their status.
- `aix list rules`: Show active rules and activation modes.
- `aix list prompts`: Show configured prompts.
- `aix list agents`: Show configured agents, their modes, models, and references.
- `aix list hooks`: Show configured hooks, their matchers, and what each one runs.
- `aix list editors`: Show detected/configured editors.

## Flags

| Flag                                                     | Description                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--only <field>`                                         | Filter by section: `rules`, `prompts`, `mcp`, `skills`, `agents`, `hooks`, `editors`. |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Filter by user-level or project-level config.                                         |
| `--all`                                                  | List all editor config, including items not managed by aix.                           |
| `--editor <name>` / `-e`                                 | Limit `--all` output to specific editors. Repeatable.                                 |
| `--json`                                                 | Output as JSON.                                                                       |

Use `aix list --all` to inspect actual editor files, including symlinked native skills and externally managed items.

`aix list --all` reports hooks alongside the other item types, listed by event name.

Every item is marked `aix` or `external`. `aix install`, `aix add`, and `aix sync` record
what they wrote in `.aix/state.json` (or `~/.aix/state.json` for user scope), and anything
found in an editor's config that is not in that record is `external` — put there by hand or
by another tool. Dropping an item from `ai.json` and installing again stops it being
tracked, so it shows as `external` until you remove it from the editor too.
