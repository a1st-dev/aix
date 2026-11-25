---
sidebar:
   order: 30
title: Prompts
description: Reusable slash commands and workflows.
---

**Prompts** are predefined commands or workflows that you invoke in your editor, usually as a slash command such as `/refactor` or `/review`.

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

## Editor support

aix writes a prompt in the editor's own prompt format when the editor has one, and converts it
to a skill when it does not:

- **Native prompt files**: Cursor and Claude Code (commands), Windsurf (workflows), OpenCode
  (commands), and GitHub Copilot at project scope (prompt files).
- **Converted to skills**: Zed, Codex, Google Antigravity, and Grok CLI, plus GitHub Copilot at
  user scope. See [Conversion to skills](#conversion-to-skills).

The [support matrix](/editors/supported-editors/) shows the current status for every editor.
Each editor page lists the exact project and user paths:
[Cursor](/editors/cursor/#cursor-feature-prompts),
[GitHub Copilot](/editors/copilot/#copilot-feature-prompts),
[Claude Code](/editors/claude-code/#claude-code-feature-prompts),
[Windsurf](/editors/windsurf/#windsurf-feature-prompts),
[Zed](/editors/zed/#zed-feature-prompts),
[Codex](/editors/codex/#codex-feature-prompts),
[Google Antigravity](/editors/antigravity/#antigravity-feature-prompts),
[OpenCode](/editors/opencode/#opencode-feature-prompts), and
[Grok CLI](/editors/grok/#grok-feature-prompts).

## Prompt files

Prompt files are standard markdown. aix keeps the markdown as written.

### Example `prompts/review.md`

```markdown
Review the selected code for:

1. Logic errors
2. Security vulnerabilities
3. Performance bottlenecks

Provide the output in markdown format with code blocks for suggested fixes.
```

## Arguments

Some prompts take arguments. Use the `argumentHint` property to tell the user what to provide.

```json
"refactor": {
  "argumentHint": "[function_name] [pattern]"
}
```

The content of the prompt is prefixed to the user's input.

## Install one prompt without ai.json

`aix install --type prompt` installs a single prompt file into one editor:

```bash
aix install ./prompts/review.md --type prompt --name review --target claude-code --user
```

## Conversion to skills

Zed, Codex, Google Antigravity, and Grok CLI use [Agent Skills][agent-skills] for reusable
workflows and have no separate prompt files. When you install prompts to one of these editors,
aix converts each prompt into an instruction-only skill and installs it where the editor reads
skills. GitHub Copilot gets the same treatment at user scope. The generated skill keeps the
prompt content as its instructions and uses the prompt description as the skill description.

Name conflicts are resolved in favor of real skills. If `skills.review` and `prompts.review`
are both present, aix installs the configured skill as `review` and the converted prompt as
`prompt-review`. If that name is also taken, aix adds a numeric suffix.

[agent-skills]: https://agentskills.io
