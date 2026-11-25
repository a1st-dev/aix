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
`aix install` and `aix add` write to user-scope editor config unless you pass `--project`, or,
for `aix install`, unless `ai.json` sets `"scope": "project"`. User scope means files under
your home directory, such as `~/.claude.json`, and they apply to every project you open. Step 3
shows how to preview the changes first and how to write project files instead. See
[User scope and project scope](/concepts/scopes/).
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
aix add rule "Always use TypeScript strict mode" --name typescript-strict --save --config-only
aix add mcp playwright --command "npx @playwright/mcp@latest" --save --config-only
```

`--save` writes the item to `ai.json`. `--config-only` leaves your editors alone for now, so
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

:::note[Adding without saving]
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

aix first prints the scope it is installing to. It then looks for supported editors on your
machine. If it finds one, it installs to that editor. If it finds several, it asks which ones
to install to. For each editor it prints `Installed to <editor>` followed by each change and
the path of the file it wrote.

### Which files are touched

The `ai.json` from step 1 has no `scope` field, so with no scope flag the install is user
scope. For Claude Code, the rule is written under `~/.claude/rules/` and the MCP server is
added to `~/.claude.json`. Other editors use their own locations, which are listed on each
editor's page under [Supported editors](/editors/supported-editors/).

Some editors have no user-scope file for a feature. Cursor, for example, keeps user rules in
its settings UI, so aix cannot write the rule there. aix prints a warning for anything it could
not place at the scope you asked for.

To write project files instead, pass `--project`:

```bash
aix install --project
```

For Claude Code this writes the rule under `.claude/rules/` and the MCP server to `.mcp.json`
in the project. To make project scope the default for this `ai.json`, add `"scope": "project"`
to it.

aix backs up an existing file before it changes it. [`aix backups`](/cli/backups/) lists the
backups, and [Backups and restore](/concepts/backups-and-restore/) shows how to put a file
back or undo an install.

Run `aix install` again whenever you change `ai.json`.

## What's next

- Learn about [skills](/concepts/skills/), [rules](/concepts/rules/),
  [prompts](/concepts/prompts/), and [MCP servers](/concepts/mcp-servers/).
- Read [What aix writes and where](/concepts/files-and-directories/) to see which files to
  commit.
- See the full [ai.json reference](/configuration/ai-json-reference/).
- Browse the [CLI reference](/cli/overview/).
- Already have editor config? [Import it](/getting-started/import-from-editor/).
