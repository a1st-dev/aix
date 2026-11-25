---
sidebar:
   order: 5
title: aix remove
description: Remove one item from your editors, and optionally from ai.json.
---

Removes a skill, rule, prompt, agent, MCP server, hook, plugin, or marketplace from editor
config. On its own, `aix remove` does not read or change `ai.json`. Pass `--save` to also
remove the entry from `ai.json`.

## Usage

```bash
aix remove <type> <name> [flags]
```

`<type>` is one of `skill`, `rule`, `prompt`, `agent`, `mcp`, `hook`, `plugin`, or
`marketplace`. `<name>` is the item name, or the event name for `aix remove hook`.

## What remove does

1. aix works out which editors to look in. With `--target`, it uses only the editors you
   name. Otherwise it looks in every detected editor, every editor that aix recorded an
   install of this item for, and, with `--save`, every editor listed in `ai.json`.
2. It prints what it is about to remove from each editor.
3. It asks for confirmation, unless you pass `--yes`. When `aix remove skill`, `rule`,
   `prompt`, or `agent` finds no such item and `--save` was not passed, it says so and stops
   without asking.
4. It removes the item from the editors, and with `--save` from `ai.json`.

`aix remove` works at user scope unless you pass `--project` or `--scope project`. With
`--save` it follows the `scope` field of the `ai.json` it loads when no scope flag is passed.
It only looks at the one scope it resolved. See
[User scope and project scope](/concepts/scopes/).

### Confirmation

Every remove command asks before it changes anything. `--yes` (`-y`) skips the question.
Without a terminal there is nobody to ask, so the command fails with a message that ends in
`Pass --yes to confirm.`

### With `--save`

The item must exist in `ai.json`, or the command fails before it removes anything. aix
removes the entry from `ai.json`, or from `ai.local.json` with `--local`, and backs up the
file first.

## Commands

### Skills, rules, prompts, and agents

```bash
aix remove skill <name>
aix remove rule <name>
aix remove prompt <name>
aix remove agent <name>
```

Editors store each of these as its own file or directory. For each editor, aix asks the
editor's own importer where the item called `<name>` is at the chosen scope, and deletes only
the file or directory it reports. If no editor has an item with that name, nothing is deleted.

For a skill, aix also deletes the shared copy in `.aix/skills/` (`~/.aix/skills/` at user
scope) once no other editor uses it. When you remove a skill from only some editors with
`--target`, the shared copy stays, and aix keeps its record of the skill for the other
editors.

With `--save`, aix installs the affected sections of `ai.json` again after deleting the
files, so that content derived from them is rebuilt.

aix backs up each file or directory before it deletes it. A symbolic link is removed without
a backup, because the file it points to stays.

```bash
aix remove skill react
aix remove rule coding-standards --yes
aix remove prompt review --project --target claude-code
aix remove agent reviewer --save
```

### `aix remove mcp`

```bash
aix remove mcp <name>
```

Removes the server entry from each editor's MCP config file at the chosen scope. aix backs
up the file before it changes it.

Windsurf and Codex keep MCP servers only in a user-scope file
(`~/.codeium/windsurf/mcp_config.json` and `~/.codex/config.toml`). A project-scope removal
leaves those files alone, so remove a server from those editors at user scope.

```bash
aix remove mcp github
aix remove mcp github --save --yes
```

### `aix remove hook`

```bash
aix remove hook <event>
```

Removes every entry your editors hold for the event, including entries you wrote by hand.
Hooks belonging to other events survive even when they share a native event name: removing
`pre_command` from Claude Code drops the `PreToolUse` groups matching `Bash` and leaves a
`pre_file_write` group matching `Write|Edit` in place. aix backs up each hooks file before it
changes it.

```bash
aix remove hook pre_command
aix remove hook session_start --target claude-code
```

### `aix remove plugin`

```bash
aix remove plugin <name>
```

Removes the plugin from each editor's plugin config at the chosen scope. aix backs up the
file before it changes it.

```bash
aix remove plugin skill-creator@claude-plugins-official --yes
```

### `aix remove marketplace`

```bash
aix remove marketplace <name>
```

Removes the marketplace from each editor's config at the chosen scope. aix backs up the file
before it changes it.

```bash
aix remove marketplace claude-plugins-official --yes
```

## Flags

Every `aix remove` command takes these flags:

| Flag                                                     | Description                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `--yes` / `-y`                                           | Skip the confirmation.                                            |
| `--target <editor>` / `-t`                               | Remove from this editor only. Repeatable.                         |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Remove at user scope or project scope. The default is user scope. |
| `--save` / `-s`                                          | Also remove the entry from `ai.json`.                             |
| `--local` / `-l`                                         | With `--save`, remove the entry from `ai.local.json` instead.     |
| `--lock`                                                 | With `--save`, create or refresh `ai.lock.json` after removing.   |
| `--config-only`                                          | With `--save`, edit the config file and leave the editors alone.  |

`--local`, `--lock`, and `--config-only` are rejected without `--save`. `--lock` cannot be
combined with `--local`, and `--scope` cannot be combined with `--user` or `--project`. `--no-delete`, `--no-sync`, and `--no-install` are
other spellings of `--config-only`.

The [global flags](/cli/overview/#global-flags) also apply. `--config` is only read with
`--save`.

## Exit status

The command exits with a non-zero status when a removal fails for any editor.

## Undoing a removal

aix backs up every file and directory before it changes or deletes it, except a symbolic
link. Restore the editor config file, or the deleted skill, rule, prompt, or agent, with
[`aix backups restore`](/cli/backups/). You can also add the item again with
[`aix add`](/cli/add/) or [`aix install`](/cli/install/).
