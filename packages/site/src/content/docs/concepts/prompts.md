---
slug: concepts/prompts
sidebar:
   order: 3
title: Prompts
description: Reusable slash commands and workflows.
---

**Prompts** are pre-defined commands or workflows that you can invoke in your editor, typically via a slash command (e.g., `/refactor`, `/review`).

## Usage

Define prompts in `ai.json`:

```json
{
   "prompts": {
      "review": {
         "description": "Review the selected code for bugs and style issues.",
         "path": "./prompts/review.md"
      },
      "plan": {
         "description": "Generate a step-by-step implementation plan.",
         "argumentHint": "[feature description]",
         "content": "Create a detailed step-by-step plan to implement: "
      }
   }
}
```

## Editor Support

aix maps these prompts to the native feature in each editor:

- **Cursor**: Maps to `.cursor/prompts/` (accessible via `/`).
- **Claude Code**: Maps to `.claude/commands/`.
- **VS Code**: Maps to `.github/prompts/*.prompt.md`.
- **Windsurf**: Maps to Cascade commands.
- **Codex**: Maps to global prompts at `~/.codex/prompts/`.
- **Zed**: Not supported.

## Prompt Files

Prompt files are standard markdown. Markdown is preserved as-is.

### Example `prompts/review.md`

```markdown
Review the selected code for:

1. Logic errors
2. Security vulnerabilities
3. Performance bottlenecks

Provide the output in markdown format with code blocks for suggested fixes.
```

## Arguments

Some prompts take arguments. Use the `argumentHint` property to explicitly tell the user what to provide.

```json
"refactor": {
  "argumentHint": "[function_name] [pattern]"
}
```

The content of the prompt will be prefixed to the user's input.
