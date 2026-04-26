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
- `aix list editors`: Show detected/configured editors.

## Flags

| Flag                                                     | Description                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `--only <field>`                                         | Filter by section: `rules`, `prompts`, `mcp`, `skills`.     |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Filter by user-level or project-level config.               |
| `--all`                                                  | List all editor config, including items not managed by aix. |
| `--editor <name>` / `-e`                                 | Limit `--all` output to specific editors. Repeatable.       |
| `--json`                                                 | Output as JSON.                                             |

Use `aix list --all` to inspect actual editor files, including symlinked native skills and externally managed items.
