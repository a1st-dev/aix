---
sidebar:
   order: 7
title: aix remove
description: Remove items from your configuration.
---

Removes items from `ai.json` (or `ai.local.json`) and uninstalls them from editors in one step. If no `ai.json` exists in the current directory, the item is uninstalled directly from editors.

For skills, aix removes both the managed `.aix/skills/{name}/` copy and any native editor link for the selected scope before regenerating pointer-style rule output where needed.

## Usage

```bash
aix remove <type> <name> [flags]
```

`<name>` is the item name, or the event name for `aix remove hook`.

## Commands

### `aix remove skill`

```bash
aix remove skill react
```

### `aix remove mcp`

```bash
aix remove mcp github
```

Also cleans up global MCP config if the server is no longer used by any project.

### `aix remove agent`

```bash
aix remove agent <name>
aix remove agent reviewer --yes
```

Removes the agent from `ai.json` (or `ai.local.json`) and deletes the generated agent files across all configured editors.

### `aix remove hook`

```bash
aix remove hook pre_command
aix remove hook session_start --user --target claude-code
```

Removes the event from `ai.json` and every entry your editors hold for it, including
entries you wrote by hand. Hooks belonging to other events survive even when they share a
native event name: removing `pre_command` from Claude Code drops the `PreToolUse` groups
matching `Bash` and leaves a `pre_file_write` group matching `Write|Edit` in place. With
`--user`, `ai.json` is neither read nor written, matching `aix add hook --user`.

### `aix remove plugin`

```bash
aix remove plugin <name>
aix remove plugin skill-creator@claude-plugins-official --yes
```

Removes the plugin from `ai.json` and uninstalls/unregisters it from configured editors.

### `aix remove marketplace`

```bash
aix remove marketplace <name>
aix remove marketplace claude-plugins-official --yes
```

Removes the marketplace from `ai.json` and unregisters it from configured editors.

## Flags

| Flag                                                     | Description                                     |
| -------------------------------------------------------- | ----------------------------------------------- |
| `--local` / `-l`                                         | Remove from `ai.local.json`.                    |
| `--yes` / `-y`                                           | Skip confirmation prompt.                       |
| `--no-delete`                                            | Skip deleting files from editors (for skills).  |
| `--no-sync`                                              | Skip syncing editor config (for MCP and hooks). |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Target user-level or project-level config.      |
