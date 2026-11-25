---
sidebar:
   order: 20
title: Rules
description: Instructions an editor applies always or under a condition.
---

**Rules** are instructions an editor applies while it works: coding conventions, constraints,
and preferences. A rule is either always on or applied under a condition, such as when the
files being edited match a pattern.

Editors have different names for the same idea, including rules, instructions, memory files,
and `AGENTS.md`. aix calls all of them rules and writes each one in the form the target editor
reads.

## Usage

Define rules in `ai.json`:

```json
{
   "rules": {
      "conciseness": {
         "activation": "always",
         "content": "Be concise. Do not explain code unless asked."
      },
      "testing": {
         "activation": "glob",
         "globs": ["**/*.test.ts"],
         "content": "Use Vitest. Prefer 'it' over 'test'."
      }
   }
}
```

## Activation modes

| Mode     | Description                                                   | Written natively for                                              |
| -------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `always` | Active for every request.                                     | All editors                                                       |
| `glob`   | Active when the files in play match one of `globs`.           | Cursor, GitHub Copilot, Claude Code, Windsurf, Google Antigravity |
| `auto`   | The editor decides when to apply the rule from `description`. | Cursor, Windsurf, Google Antigravity                              |
| `manual` | Applied only when the user refers to the rule explicitly.     | Cursor, Windsurf, Google Antigravity                              |

Editors that keep rules in a single markdown file, such as OpenCode, Zed, and Codex, have no
per-rule activation setting. For those editors, and for any mode an editor does not support,
aix writes the rule without the condition, so it applies to every request. Codex is a partial
exception: a `glob` rule whose patterns share one directory is written to an `AGENTS.md` in
that directory.

## Where rules are written

The [support matrix](/editors/supported-editors/) shows rule support for every editor. Each
editor page lists the exact project and user paths:
[Cursor](/editors/cursor/#cursor-feature-rules),
[GitHub Copilot](/editors/copilot/#copilot-feature-rules),
[Claude Code](/editors/claude-code/#claude-code-feature-rules),
[Windsurf](/editors/windsurf/#windsurf-feature-rules),
[Zed](/editors/zed/#zed-feature-rules),
[Codex](/editors/codex/#codex-feature-rules),
[Google Antigravity](/editors/antigravity/#antigravity-feature-rules),
[OpenCode](/editors/opencode/#opencode-feature-rules), and
[Grok CLI](/editors/grok/#grok-feature-rules).

A few behaviors are worth knowing before you install:

- Where an editor keeps rules in a shared file such as `AGENTS.md`, aix writes its rules into
  a managed section of that file and leaves the rest of the file alone.
- For Claude Code at user scope, aix writes one file per rule under `~/.claude/rules/` and
  lists them as `@rules/...` imports in a managed section of `~/.claude/CLAUDE.md`. Your own
  notes in `CLAUDE.md` stay as they are.
- Cursor and GitHub Copilot have no user-scope rules file that aix writes. A user-scope
  install, which is the default, skips rules for those editors and prints a warning. Use
  `--project` to write their project rules.

## Sources

A rule takes its content from exactly one source:

- **Inline**: `"content": "..."`
- **File**: `"path": "./rules/rule.md"`
- **Git**: `"git": { "url": "...", "path": "...", "ref": "..." }`
- **npm**: `"npm": { "npm": "@company/rules", "path": "rules/style.md" }`

## Install one rule without ai.json

`aix install --type rule` installs a single rule file into one editor:

```bash
aix install ./rules/typescript.md --type rule --name typescript --target claude-code --user
```

## Common use cases

- **Code style**: indentation, naming conventions, preferred libraries.
- **Workflow**: "Always write tests before code", "Update documentation when changing APIs".
- **Tone**: "Be Socratic", "Act as a senior engineer".
