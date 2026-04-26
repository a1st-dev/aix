---
sidebar:
   order: 3
title: Import from an Editor
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

| Editor         | Flag value    |
| -------------- | ------------- |
| Cursor         | `cursor`      |
| GitHub Copilot | `copilot`     |
| Claude Code    | `claude-code` |
| Windsurf       | `windsurf`    |
| Zed            | `zed`         |
| Codex          | `codex`       |
| Gemini         | `gemini`      |
| OpenCode       | `opencode`    |

## What gets imported

aix reads the editor's existing config files and extracts:

- **Rules** — `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, etc.
- **MCP servers** — from the editor's MCP config JSON
- **Prompts** — custom prompt files if the editor stores them
- **Skills** — any SKILL.md references

Imported content is written to `.aix/imported/` and referenced from `ai.json`:

```json
{
   "rules": {
      "imported-cursor": {
         "path": ".aix/imported/rules/cursor.md"
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

## init --from vs sync

- `aix init --from cursor` reads Cursor and creates `ai.json`.
- `aix sync cursor --to claude-code` reads Cursor and writes Claude Code directly.

Sync reads the supported config from the source editor and writes the supported equivalent to the
destination editor. aix does not require a custom converter for every editor pair.

## Overwrite protection

If `ai.json` already exists, `aix init --from` will refuse to overwrite it. Use `--force` to override:

```bash
aix init --from cursor --force
```

## Next steps

After importing, review the generated `ai.json` and clean up anything that doesn't apply across editors. Then run:

```bash
aix install
```

This syncs the config to all your detected editors — including the one you originally imported from.
