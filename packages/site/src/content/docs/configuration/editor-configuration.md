---
sidebar:
   order: 4
title: Editor configuration
description: Choose which editors aix installs to and give an editor its own rules.
---

By default, `aix install` looks for the supported editors installed on your machine. If it
finds one, it installs to it. If it finds several, it asks which ones to use. The `editors`
field in `ai.json` replaces that detection with a fixed list, and lets you add rules for one
editor only.

## Editor IDs

`ai.json` and the `--target` flag refer to editors by ID:

| Editor             | ID            |
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

## Limiting installation

To install to specific editors only, list them:

```json
{
   "editors": ["cursor", "copilot", "opencode"]
}
```

Or use the object form, which can also switch an editor off:

```json
{
   "editors": {
      "cursor": { "enabled": true },
      "copilot": { "enabled": true },
      "opencode": { "enabled": true },
      "windsurf": { "enabled": false }
   }
}
```

When `editors` is set, aix installs to the listed, enabled editors and does not detect or ask.
If you later take an editor off the list, the next `aix install` also removes what this
`ai.json` had installed for that editor.

The array form does not accept `codex` at the moment. To target Codex from `ai.json`, use the
object form: `"editors": { "codex": { "enabled": true } }`.

### Overriding the list for one run

`--target` (or `-t`) takes precedence over `editors` for a single command and can be repeated:

```bash
aix install --target cursor --target claude-code
```

## Editor-specific rules

Sometimes one editor needs an instruction the others should not get. Define rules under that
editor in the object form:

```json
{
   "editors": {
      "cursor": {
         "rules": {
            "cursor-shortcuts": {
               "content": "Use cmd+k for inline edits..."
            }
         }
      }
   }
}
```

Rules defined here are written only to that editor, in addition to the shared rules in the
top-level `rules` field. They take the same fields as any other
[rule](/concepts/rules/).

## Other settings

`enabled` and `rules` are the only settings aix reads under an editor. The schema also accepts
a `cascadeSettings` object for Windsurf, `aiSettings` for Cursor, `permissions` for Claude
Code, and `antigravitySettings` for Google Antigravity, but aix does not write them to any
editor.
