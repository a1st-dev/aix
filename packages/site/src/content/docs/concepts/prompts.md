---
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

aix maps these prompts to the native feature in each editor when one exists:

- **Cursor**: Maps to `.cursor/prompts/` (accessible via `/`).
- **Claude Code**: Maps to `.claude/commands/`.
- **GitHub Copilot**: Project installs map to `.github/prompts/*.prompt.md`, with native
  prompt-file frontmatter for `name`, `description`, and `argument-hint`. User-scope installs
  are converted into Copilot skills under `~/.config/github-copilot/skills/`.
- **Windsurf**: Maps to Cascade commands.
- **Codex**: Prompts are deprecated and unsupported natively. aix converts them to instruction-only Agent Skills during install.
- **Gemini**: Maps to project/global TOML files in `.gemini/commands/`.
- **OpenCode**: Maps to markdown command files in `.opencode/commands/` or `~/.config/opencode/commands/`.
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

## Codex conversion

Codex uses [Agent Skills][codex-skills] for reusable workflows. When you install an `ai.json` that contains prompts to Codex, aix converts each prompt into a skill and links it into `.agents/skills/`. The generated skill keeps the prompt content as instructions and includes the prompt description as the skill description.

Name conflicts are resolved in favor of real skills. If `skills.review` and `prompts.review` are both present, aix installs the configured skill as `review` and installs the converted prompt as `prompt-review`. If that name is already taken, aix adds a numeric suffix.

[codex-skills]: https://developers.openai.com/codex/skills
