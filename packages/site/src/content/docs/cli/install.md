---
slug: cli/install
sidebar:
   order: 3
title: aix install
description: Sync configuration to editors.
---

Reads `ai.json` (and `ai.local.json`), resolves all inheritance, and writes configuration files for supported editors.

## Usage

```bash
aix install [source] [flags]
```

If `source` is provided (git URL, file path), it installs directly from that source without needing a local `ai.json`.

## Flags

| Flag                       | Description                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `--target <editor>` / `-t` | Limit installation to specific editors. Repeatable.                                   |
| `--dry-run` / `-d`         | Preview changes without writing files.                                                |
| `--save`                   | When installing a remote source, save it to local `ai.json`.                          |
| `--overwrite`              | With `--save`, overwrite local config instead of merging.                             |
| `--clean`                  | Remove the `.aix` folder before install to ensure a fresh state.                      |
| `--copy`                   | With `--save`, copy remote files to `.aix/imported/` instead of referencing git URLs. |
| `--scope <field>` / `-s`   | Limit to specific fields: `rules`, `prompts`, `mcp`, `skills`.                        |

## Examples

**Standard install:**

```bash
aix install
```

**Install only to VS Code:**

```bash
aix install --target vscode
```

**Install a remote config directly:**

```bash
aix install github:company/ai-config
```

**Install remote config and save it to your local ai.json:**

```bash
aix install github:company/ai-config --save
```
