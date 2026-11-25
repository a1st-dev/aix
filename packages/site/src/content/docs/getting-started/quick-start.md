---
sidebar:
   order: 2
title: Quick start
description: Create an ai.json, add a rule and an MCP server to it, and install both to your editors.
---

This guide creates an `ai.json`, saves one rule and one
<abbr class="aix-term" title="Model Context Protocol">MCP</abbr> server to it, and installs both
into your editors. It assumes aix is [installed](/getting-started/installation/).

:::caution[Installs default to user scope]
`aix install` and `aix add` write to user-scope editor config unless you pass `--project`. User
scope means files under your home directory, such as `~/.claude.json`, and they apply to every
project you open. Step 3 shows how to preview the changes first and how to write project files
instead.
:::

## 1. Create ai.json

Run `aix init` in your project root:

```bash
aix init
```

This creates `ai.json` with an empty entry for each section:

```json
{
   "skills": {},
   "mcp": {},
   "rules": {},
   "prompts": {},
   "agents": {},
   "plugins": {},
   "marketplaces": {}
}
```

:::tip[Already have editor config?]
`aix init --from cursor` reads the config Cursor already has and writes it into a new `ai.json`.
See [Import from an editor](/getting-started/import-from-editor/) for the supported editors and
what is imported.
:::

## 2. Save a rule and an MCP server

```bash
aix add rule "Always use TypeScript strict mode" --name typescript-strict --save --no-install
aix add mcp playwright --command "npx @playwright/mcp@latest" --save --no-install
```

`--save` writes the item to `ai.json`. `--no-install` leaves your editors alone for now, so
step 3 can preview the install before anything is written.

`ai.json` now contains both items:

```json
{
   "skills": {},
   "mcp": {
      "playwright": {
         "command": "npx @playwright/mcp@latest"
      }
   },
   "rules": {
      "typescript-strict": {
         "content": "Always use TypeScript strict mode"
      }
   },
   "prompts": {},
   "agents": {},
   "plugins": {},
   "marketplaces": {}
}
```

You can also edit `ai.json` by hand. The [ai.json reference](/configuration/ai-json-reference/)
lists every field.

:::note[`aix add` without `--save`]
Without `--save`, `aix add` does not touch `ai.json`. It installs the item straight into the
user-scope config of every editor it detects. That is useful for a personal one-off, and it is
not recorded anywhere a teammate can see.
:::

## 3. Install to your editors

Preview first. `--dry-run` lists, for each editor, the files aix would create or change, and
writes nothing:

```bash
aix install --dry-run
```

Then install:

```bash
aix install
```

aix looks for supported editors on your machine. If it finds one, it installs to that editor.
If it finds several, it asks which ones to install to. For each editor it then prints
`Installed to <editor>` followed by the files it wrote.

### Which files are touched

With no scope flag, the install is user scope. For Claude Code, the rule is written under
`~/.claude/rules/` and the MCP server is added to `~/.claude.json`. Other editors use their
own locations, which are listed on each editor's page under
[Supported editors](/editors/supported-editors/).

Some editors have no user-scope file for a feature. Cursor, for example, keeps user rules in
its settings UI, so aix cannot write the rule there. aix prints a warning for anything it could
not place at the scope you asked for.

To write project files instead, pass `--project`:

```bash
aix install --project
```

For Claude Code this writes the rule under `.claude/rules/` and the MCP server to `.mcp.json`
in the project.

aix backs up an existing file before it changes it. [`aix backups`](/cli/backups/) lists the
backups.

Run `aix install` again whenever you change `ai.json`.

## What's next

- Learn about [skills](/concepts/skills/), [rules](/concepts/rules/),
  [prompts](/concepts/prompts/), and [MCP servers](/concepts/mcp-servers/).
- See the full [ai.json reference](/configuration/ai-json-reference/).
- Browse the [CLI reference](/cli/overview/).
- Already have editor config? [Import it](/getting-started/import-from-editor/).
