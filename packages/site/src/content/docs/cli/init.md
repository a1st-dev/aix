---
sidebar:
   order: 2
title: aix init
description: Initialize a new configuration.
---

Creates a new `ai.json` file in the current directory.

## Usage

```bash
aix init [flags]
```

## Flags

| Flag                                       | Description                                       |
| ------------------------------------------ | ------------------------------------------------- |
| `--force` / `-f`                           | Overwrite existing `ai.json` if it exists.        |
| `--from <editor>`                          | Import supported config from an existing editor.  |
| `--extends <ref>`                          | Set the `extends` reference in the new `ai.json`. |
| `--lock`                                   | Create `ai.lock.json` beside the new config.      |
| `--scope <scope>` / `--user` / `--project` | Set the `scope` field (`user` or `project`).      |

The `--extends` flag accepts any reference type: local paths, URLs, git repos, or npm packages.

```bash
# Initialize with an extends reference
aix init --extends github:company/ai-config

# Initialize with a lockfile
aix init --lock

# Initialize a user-scoped config
aix init --scope user

# Combine both
aix init --extends github:company/ai-config --scope user
```

## Importing Config

The `--from` flag lets you bootstrap `ai.json` from:

- `cursor`
- `copilot`
- `windsurf`
- `claude-code`
- `zed`
- `codex`
- `gemini`
- `opencode`

When importing, aix will:

1. Read the editor's config files.
2. Extract rules, prompts, and MCP settings.
3. Write extracted content to `.aix/imported/`.
4. Generate an `ai.json` linking to those files.

`aix init --from` is the right command when you want `ai.json` to become the source of
truth. If you want direct editor-to-editor migration, use [`aix sync`](/cli/sync/).

See [Import from an Editor](/getting-started/import-from-editor/) for details.
