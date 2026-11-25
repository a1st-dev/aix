---
sidebar:
   order: 50
title: Agents
description: Specialized primary agents and subagents in aix.
---

**Agents** are reusable instruction profiles for specialized work, such as a code reviewer or
a test writer. Define them once in `ai.json`, and aix writes them to each editor's own agent
location when that editor has a file format for them.

## Usage

Define agents in `ai.json`:

```json
{
   "agents": {
      "code-reviewer": {
         "description": "Review code changes before a PR",
         "mode": "subagent",
         "model": "sonnet",
         "tools": ["Read", "Grep"],
         "permissions": {
            "edit": "deny",
            "bash": "ask"
         },
         "content": "Review the current diff for bugs and missing tests."
      }
   }
}
```

An agent takes its instructions from exactly one source: inline `content`, a local `path`, a
`git` source, or an `npm` source. A string value is shorthand for a path or git reference:

```json
{
   "agents": {
      "code-reviewer": "./agents/code-reviewer.md"
   }
}
```

## Modes

Use `"mode": "subagent"` for a specialist the main assistant delegates to, and
`"mode": "primary"` for editors that let you switch the main assistant profile.

## Portable and editor-specific fields

The portable fields are `description`, `mode`, `model`, `tools`, `permissions`, `mcp`, and the
instruction source. aix maps them to whatever the target editor supports.

Fields that only one editor understands live under `editor`, keyed by editor ID:

```json
{
   "agents": {
      "tester": {
         "content": "Test the changed behavior.",
         "editor": {
            "antigravity": {
               "temperature": 0.2,
               "maxTurns": 8
            }
         }
      }
   }
}
```

## Add an agent from the command line

`aix add agent` takes a markdown file or a git reference:

```bash
# Install into your user-scope editor config
aix add agent ./agents/code-reviewer.md

# Set the name and mode
aix add agent ./agents/coder.md --name my-coder --mode primary

# Save to ai.json, then install from it
aix add agent ./agents/code-reviewer.md --save --config-only
aix install
```

Without `--save`, `aix add agent` leaves `ai.json` unchanged. The name is taken from the file
name unless you pass `--name`, and it must be lowercase letters, digits, and single hyphens.
See [`aix add`](/cli/add/) for every flag.

## Editor support

aix writes agent files for Cursor, GitHub Copilot, Claude Code, Google Antigravity, and
OpenCode. Windsurf, Zed, Codex, and Grok CLI have no agent files that aix manages. For those
editors aix reports configured agents as unsupported and does not write a fallback.

The [support matrix](/editors/supported-editors/) shows the current status. Each editor page
lists the exact project and user paths and the agent fields that editor accepts:
[Cursor](/editors/cursor/#cursor-feature-agents),
[GitHub Copilot](/editors/copilot/#copilot-feature-agents),
[Claude Code](/editors/claude-code/#claude-code-feature-agents),
[Google Antigravity](/editors/antigravity/#antigravity-feature-agents), and
[OpenCode](/editors/opencode/#opencode-feature-agents).
