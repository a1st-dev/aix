---
sidebar:
   order: 2
title: aix init
description: Create an ai.json, empty or imported from an editor.
---

Creates `ai.json` in the working directory. It does not install anything into your editors.

## Usage

```bash
aix init [flags]
```

If `ai.json` already exists, the command fails. Pass `--force` to replace the file. aix
backs up the old file first. See [`aix backups`](/cli/backups/).

## Flags

| Flag                                                     | Description                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--force` / `-f`                                         | Overwrite an existing `ai.json`.                                                    |
| `--from <editor>`                                        | Import the config an editor already has. See [Importing config](#importing-config). |
| `--extends <ref>` / `-e`                                 | Set the `extends` field of the new `ai.json`.                                       |
| `--lock`                                                 | Create `ai.lock.json` beside the new `ai.json`.                                     |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Choose the `scope` to record. See [The scope field](#the-scope-field).              |

`--extends` accepts a local path, a URL, a git shorthand such as `github:org/repo`, or an npm
package.

```bash
# Create an empty ai.json
aix init

# Create one that extends a shared config
aix init --extends github:company/ai-config

# Create ai.json and ai.lock.json
aix init --lock

# Create one that installs at user scope
aix init --scope user
```

## The scope field

`aix init --user` (or `--scope user`) writes `"scope": "user"` into the new file, and
`aix init --project` (or `--scope project`) writes `"scope": "project"`.

With no scope flag, `aix init` writes no `scope` field.
[`aix install`](/cli/install/#scope) treats a file without the field as user scope, so run
`aix init --project` when the config should install into the project.

## Importing config

`--from` creates `ai.json` from the config an editor already has. It accepts:

- `cursor`
- `copilot`
- `windsurf` (or `devin`)
- `claude-code`
- `zed`
- `codex`
- `antigravity` (or `agy`)
- `opencode`
- `grok` (or `grok-cli`)

aix reads the editor's config at both user scope and project scope, then:

1. Copies rules, prompts, and agents into `.aix/imported/` as Markdown files, and refers to
   each one by path in `ai.json`.
2. Writes MCP servers, skills, and hooks into `ai.json` directly.

Plugins and marketplaces are not imported.

`aix init --from` is the right command when you want `ai.json` to become the source of
truth. If you want direct editor-to-editor migration, use [`aix sync`](/cli/sync/).

See [Import from an editor](/getting-started/import-from-editor/) for details.
