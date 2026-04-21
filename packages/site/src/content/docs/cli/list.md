---
slug: cli/list
sidebar:
   order: 8
title: aix list
description: List configured skills, MCP servers, and rules.
---

Display what is currently configured in your project. Items are labeled with their scope (user/project).

## Usage

```bash
aix list [subcommand]
```

## Commands

- `aix list skills`: Show installed skills and their sources.
- `aix list mcp`: Show configured MCP servers and their status.
- `aix list rules`: Show active rules and activation modes.
- `aix list editors`: Show detected/configured editors.

## Flags

| Flag                                       | Description                                                  |
| ------------------------------------------ | ------------------------------------------------------------ |
| `--only <field>`                           | Filter by section: `rules`, `prompts`, `mcp`, `skills`.     |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Filter by user-level or project-level config.                |
| `--all`                                    | List all editor config, including items not managed by aix.  |
| `--json`                                   | Output as JSON.                                              |
