---
slug: getting-started/quick-start
sidebar:
   order: 2
title: Quick Start
description: Create your first ai.json and install it to your editors in under a minute.
---

## 1. Initialize ai.json

Run `aix init` in your project root:

```bash
aix init
```

This creates a minimal `ai.json`:

```json
{
   "skills": {},
   "mcp": {},
   "rules": {},
   "prompts": {}
}
```

:::tip[Already have editor config?]
If your editor already has AI rules, prompts, or MCP servers configured, `--from` can import them directly:

```bash
aix init --from cursor
```

This reads your existing editor config and generates a pre-populated `ai.json`, writing imported files to `.aix/imported/`. See the [full import guide](/getting-started/import-from-editor/) for supported editors and details.
:::

## 2. Add some configuration

Add a rule, a prompt, and an MCP server:

```bash
# Add a rule (inline text)
aix add rule "Always use TypeScript strict mode" --name typescript-strict

# Add a prompt from a file
aix add prompt ./prompts/review.md --name review

# Add an MCP server from the registry
aix add mcp github
```

Your `ai.json` now looks something like:

```json
{
   "skills": {},
   "mcp": {
      "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
      }
   },
   "rules": {
      "typescript-strict": {
         "content": "Always use TypeScript strict mode"
      }
   },
   "prompts": {
      "review": "./prompts/review.md"
   }
}
```

## 3. Install to your editors

```bash
aix install
```

aix detects which AI editors you have installed and syncs the config to each one. You'll see output like:

```
✓ Cursor — 1 rule, 1 prompt, 1 MCP server
✓ VS Code — 1 rule, 1 prompt, 1 MCP server
✓ Claude Code — 1 rule, 1 prompt, 1 MCP server
```

Run `aix install` again whenever you change `ai.json`.

## 4. Preview before applying

Use `--dry-run` to see what aix would write without making any changes:

```bash
aix install --dry-run
```

## What's next

- Learn about [skills](/concepts/skills/), [rules](/concepts/rules/), [prompts](/concepts/prompts/), and [MCP servers](/concepts/mcp-servers/)
- See the full [ai.json reference](/configuration/ai-json-reference/)
- Browse the [CLI reference](/cli/overview/)
- Already have editor config? [Import it](/getting-started/import-from-editor/)
