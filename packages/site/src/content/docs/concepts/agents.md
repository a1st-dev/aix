---
title: Agents
description: Specialized primary agents and subagents in aix.
---

Agents are reusable instruction profiles for specialized work. Define them once in
`ai.json`; aix writes them to each editor's native agent location when that editor has a
documented file format.

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

Use `mode: "subagent"` for delegated specialists and `mode: "primary"` for editors that
support switching the main assistant profile. The portable fields are `description`,
`mode`, `model`, `tools`, `permissions`, `mcp`, and the instruction source.

Editor-specific fields live under `editor`:

```json
{
   "agents": {
      "tester": {
         "content": "Test the changed behavior.",
         "editor": {
            "gemini": {
               "temperature": 0.2,
               "maxTurns": 8
            }
         }
      }
   }
}
```

Supported native destinations:

- Claude Code: `.claude/agents/*.md` and `~/.claude/agents/*.md`
- Cursor: `.cursor/agents/*.md` and `~/.cursor/agents/*.md`
- GitHub Copilot: `.github/agents/*.md` and `~/.config/github-copilot/agents/*.md`
- Gemini: `.gemini/agents/*.md` and `~/.gemini/agents/*.md`
- OpenCode: `.opencode/agents/*.md` and `~/.config/opencode/agents/*.md`

Codex, Windsurf, and Zed do not currently have aix-managed custom agent files. aix
reports configured agents as unsupported for those editors instead of writing a lossy
fallback.
