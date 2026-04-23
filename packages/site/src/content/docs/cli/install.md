---
slug: cli/install
sidebar:
   order: 3
title: aix install
description: Apply ai.json configuration to editors.
---

Reads `ai.json` (and `ai.local.json`), resolves all inheritance, and writes configuration files for supported editors.

This command starts from `ai.json`. If you want to copy supported config directly from one
editor to another, use [`aix sync`](/cli/sync/) instead.

## Usage

```bash
aix install [source] [flags]
```

If `source` is provided (git URL, file path), it installs directly from that source without needing a local `ai.json`.

## Flags

| Flag                                                     | Description                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--target <editor>` / `-t`                               | Limit installation to specific editors. Repeatable.                                   |
| `--dry-run` / `-d`                                       | Preview changes without writing files.                                                |
| `--save`                                                 | When installing a remote source, save it to local `ai.json`.                          |
| `--overwrite`                                            | With `--save`, overwrite local config instead of merging.                             |
| `--clean`                                                | Remove the `.aix` folder before install to ensure a fresh state.                      |
| `--copy`                                                 | With `--save`, copy remote files to `.aix/imported/` instead of referencing git URLs. |
| `--only <field>`                                         | Limit to specific fields: `rules`, `prompts`, `mcp`, `skills`.                        |
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

**Override scope to install as user-level config:**

```bash
aix install --scope user
```

## install vs sync

- `aix install` is `ai.json -> editor`
- `aix sync` is `editor -> aix bridge -> editor`

That split matters. `install` applies your shared config. `sync` is for migrating or copying
existing editor config between supported editors.
