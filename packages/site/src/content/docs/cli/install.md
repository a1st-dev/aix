---
sidebar:
   order: 3
title: aix install
description: Apply ai.json configuration to editors.
---

Reads `ai.json` (and `ai.local.json`), resolves all inheritance, and writes configuration files for supported editors.

This command starts from `ai.json`. If you want to copy supported config directly from one
editor to another, use [`aix sync`](/cli/sync/) instead.

You can also install a single item without a local `ai.json` by passing `--type`.

## Usage

```bash
aix install [source] [flags]
```

If `source` is provided without `--type`, it must be an `ai.json` config source. If
`source` is provided with `--type`, aix installs that one item directly and does not
create or modify `ai.json`.

## Flags

| Flag                                                     | Description                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--target <editor>` / `-t`                               | Limit installation to specific editors. Repeatable.                                   |
| `--type <type>`                                          | Directly install one `mcp`, `skill`, `rule`, `hook`, or `prompt` without `ai.json`.   |
| `--name <name>` / `-n`                                   | Name for a direct install when aix cannot infer one.                                  |
| `--ref <ref>` / `-r`                                     | Git ref for direct install sources.                                                   |
| `--command <command>`                                    | Command for direct MCP stdio installs.                                                |
| `--args <args>`                                          | Comma-separated command arguments for direct MCP installs.                            |
| `--env <vars>`                                           | Comma-separated `KEY=value` env vars for direct MCP installs.                         |
| `--url <url>`                                            | Remote Streamable HTTP MCP URL for direct MCP installs.                               |
| `--header <header>`                                      | HTTP header for direct remote MCP installs. Repeatable `KEY=value`.                   |
| `--description <text>`                                   | Rule or prompt description for direct installs.                                       |
| `--activation <mode>`                                    | Rule activation mode for direct rule installs.                                        |
| `--globs <patterns>`                                     | Comma-separated glob patterns for direct rule installs.                               |
| `--argument-hint <hint>`                                 | Prompt argument hint for direct prompt installs.                                      |
| `--dry-run` / `-d`                                       | Preview changes without writing files.                                                |
| `--save`                                                 | When installing a remote source, save it to local `ai.json`.                          |
| `--overwrite`                                            | With `--save`, overwrite local config instead of merging.                             |
| `--clean`                                                | Remove the `.aix` folder before install to ensure a fresh state.                      |
| `--copy`                                                 | With `--save`, copy remote files to `.aix/imported/` instead of referencing git URLs. |
| `--lock`                                                 | Create or refresh `ai.lock.json` before installing.                                   |
| `--only <field>`                                         | Limit to specific fields: `rules`, `prompts`, `mcp`, `skills`, `hooks`, `agents`.     |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Override the `scope` from `ai.json` (target user-level or project-level config).      |

## Examples

**Standard install:**

```bash
aix install
```

**Install only to GitHub Copilot:**

```bash
aix install --target copilot
```

**Install a remote config directly:**

```bash
aix install github:company/ai-config
```

**Install remote config and save it to your local ai.json:**

```bash
aix install github:company/ai-config --save
```

**Install only MCP servers:**

```bash
aix install --only mcp
```

**Directly install a user-scope MCP server without ai.json:**

```bash
aix install playwright --type mcp --target claude-code --user
```

An HTTPS MCP source is treated as a remote Streamable HTTP endpoint:

```bash
aix install https://example.com/mcp --type mcp --name docs --target claude-code --user
```

**Directly install one local item:**

```bash
aix install ./skills/review --type skill --target claude-code --user
aix install ./rules/typescript.md --type rule --name typescript --target cursor
aix install ./prompts/review.md --type prompt --name review --target opencode --user
aix install ./hooks/pre-command.jsonc --type hook --target claude-code --user
```

Direct installs require `--target` and do not persist anything to `ai.json`.

**Refresh the lockfile, then install:**

```bash
aix install --lock
```

`--lock` with a remote source requires `--save`, because aix needs a local `ai.json` to
write `ai.lock.json` beside.

**Override scope to install as user-level config:**

```bash
aix install --scope user
```

## install vs sync

- `aix install` is `ai.json -> editor`
- `aix sync` is `editor -> aix bridge -> editor`

That split matters. `install` applies your shared config. `sync` is for migrating or copying
existing editor config between supported editors.
