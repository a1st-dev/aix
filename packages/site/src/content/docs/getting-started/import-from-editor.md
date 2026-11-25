---
sidebar:
   order: 3
title: Import from an editor
description: Bootstrap ai.json from your existing editor configuration.
---

If you already have rules, <abbr class="aix-term" title="Model Context Protocol">MCP</abbr>
servers, or other AI config in your editor, `aix init --from` can convert it into an `ai.json`
for you.

If you do not want an intermediate `ai.json` yet, and just want to move supported config from
one editor to another, use `aix sync <from> --to <to>` instead.

## Usage

```bash
aix init --from <editor>
```

Supported editors:

| Editor             | Flag value    |
| ------------------ | ------------- |
| Cursor             | `cursor`      |
| GitHub Copilot     | `copilot`     |
| Claude Code        | `claude-code` |
| Windsurf           | `windsurf`    |
| Zed                | `zed`         |
| Codex              | `codex`       |
| Google Antigravity | `antigravity` |
| OpenCode           | `opencode`    |
| Grok CLI           | `grok`        |

## What gets imported

aix reads the editor's config at both user scope and project scope and imports what it finds:

- **Rules, prompts, and agents** are copied into `.aix/imported/` as markdown files, and
  `ai.json` refers to each one by path.
- **MCP servers, skills, and hooks** are written into `ai.json` directly.

Each editor's page under [Supported editors](/editors/supported-editors/) lists where that
editor keeps each kind of config.

After an import, `ai.json` looks something like this:

```json
{
   "rules": {
      "typescript": {
         "path": "./.aix/imported/rules/typescript.md"
      }
   },
   "mcp": {
      "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
      }
   }
}
```

### Commit `.aix/imported/`

`ai.json` points at the files in `.aix/imported/`, so commit that directory together with
`ai.json`. Ignore the rest of `.aix/`, which aix rebuilds or uses for machine-specific state:

```text
# .gitignore
ai.local.json
.aix/*
!.aix/imported/
```

## Choosing between `init --from` and `sync`

- `aix init --from cursor` reads Cursor and creates `ai.json`.
- `aix sync cursor --to claude-code` reads Cursor and writes Claude Code directly.

Sync reads the supported config from the source editor and writes the supported equivalent to the
destination editor. It reads and writes user scope by default. Pass `--scope project` to sync
project config, and `--dry-run` to preview the result.

## Overwrite protection

If `ai.json` already exists, `aix init --from` refuses to overwrite it. Use `--force` to
replace it:

```bash
aix init --from cursor --force
```

## Next steps

After importing, review the generated `ai.json` and remove anything that should not apply to
every editor. Then preview and run the install:

```bash
aix install --dry-run
aix install
```

`aix install` writes user-scope editor config by default. Pass `--project` to write project
files instead.

When aix detects more than one editor, it asks which ones to install to, with all of them
selected the first time. Keep the editor you imported from selected so it stays in sync.
