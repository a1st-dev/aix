---
slug: cli/list
sidebar:
   order: 8
title: aix list
description: List configured skills, MCP servers, and rules.
---

Display what is currently configured in your project.

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

- `--scope <field>` / `-s`: Filter the main `list` command output.
- `--json`: Output as JSON.
