---
slug: concepts/rules
sidebar:
   order: 2
title: Rules
description: Persistent instructions that guide AI behavior.
---

**Rules** are the most fundamental configuration unit. They are instructions that are "always on" or conditionally applied to guide the AI's behavior, style, and constraints.

## Default Rules vs. Custom Rules

Most editors refer to these as "System Prompts" or "Custom Instructions". aix unifies them under the concept of **Rules**.

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

## Activation Modes

| Mode     | Description                                                        | Editor Support             |
| -------- | ------------------------------------------------------------------ | -------------------------- |
| `always` | Active for every request.                                          | All editors                |
| `glob`   | Active only when editing files matching the glob pattern.          | Cursor, GitHub Copilot, Windsurf  |
| `auto`   | The AI decides when to activate the rule based on its description. | Cursor, Windsurf (Cascade) |
| `manual` | Must be explicitly referenced by the user.                         | None (future support)      |

If an editor doesn't support a specific activation mode (like `glob`), aix falls back to `always` for that editor.

## Sources

Rules can be defined:

- **Inline**: `content: "string"`
- **File**: `path: "./rules/rule.md"`
- **Git**: `git: { url: "...", path: "..." }`
- **npm**: `npm: { package: "...", path: "..." }`

## Common Use Cases

- **Code Style**: Indentation, naming conventions, preferred libraries.
- **Workflow**: "Always write tests before code", "Update documentation when changing APIs".
- **Personality**: "Be Socratic", "Act as a senior engineer".
