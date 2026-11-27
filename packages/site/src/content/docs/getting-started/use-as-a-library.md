---
sidebar:
   order: 5
title: Use aix as a library
description: Call @a1st/aix-core from your own CLI or library to install its skill, MCP server, or other config into your users' AI editors.
---

If you publish a CLI or a library and you wrote a skill (or an MCP server, a rule, a prompt)
that teaches AI agents how to use it, your tool can install that item into the user's editors
itself. `@a1st/aix-core` is the library the `aix` command is built on. Your users do not need
`aix` installed and no `ai.json` is involved.

```bash
npm install @a1st/aix-core
```

The package is ESM-only and needs Node.js 20.19 or later in the 20.x series, or Node.js
22.12 and later.

## Detect editors and let users choose

`detectEditors()` checks each supported editor's user config and data paths and returns
a `Promise<DetectedEditor[]>`. Each match has an `id` and a `displayName`:

```json
[
   { "id": "claude-code", "displayName": "Claude Code" },
   { "id": "cursor", "displayName": "Cursor" }
]
```

Show `displayName` in your picker and pass the selected IDs to the installer. An empty selection
(`editors: []`) skips installation. Omitting `editors` installs into every detected editor.

Use `detectEditors(projectRoot, { projectOnly: true })` to find editors that already
have config in a project. Use `getAvailableEditors()` to list every editor aix supports,
for example when offering manual selection for an editor that has never been opened.

## Install a skill that ships with your CLI

Put the skill directory in your package and include it in the `files` of `package.json`:

```text
my-cli/
├── package.json
├── skills/
│   └── my-cli/
│       └── SKILL.md
└── src/
    └── agent-skill.js
```

`installSkill` copies the directory to `~/.aix/skills/my-cli` and links it into the skills
directory of each selected editor. Reinstall after an upgrade to update the copy.

```js
// src/agent-skill.js
import { fileURLToPath } from "node:url";
import { installSkill, removeSkill } from "@a1st/aix-core";

const skill = { name: "my-cli", scope: "user" },
   path = fileURLToPath(new URL("../skills/my-cli", import.meta.url));

export function installMyCliSkill(editors) {
   return installSkill({ ...skill, source: { path }, editors });
}

export function removeMyCliSkill() {
   return removeSkill(skill);
}
```

### Ask during setup

```js
import { createInterface } from "node:readline/promises";
import { detectEditors } from "@a1st/aix-core";
import { installMyCliSkill } from "./agent-skill.js";

export async function offerAgentSkill() {
   if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return;
   }

   const detected = await detectEditors();

   if (detected.length === 0) {
      console.log("No AI editor was detected.");
      return;
   }

   const prompt = createInterface({ input: process.stdin, output: process.stdout }),
      editors = [];

   try {
      for (const { id, displayName } of detected) {
         const answer = await prompt.question(
            `Install the my-cli skill for ${displayName}? [y/N] `,
         );

         if (/^y(es)?$/i.test(answer.trim())) {
            editors.push(id);
         }
      }
   } finally {
      prompt.close();
   }

   if (editors.length === 0) {
      return;
   }

   const { results } = await installMyCliSkill(editors);

   for (const result of results) {
      if (!result.success) {
         console.error(`${result.editor}: ${result.errors.join(", ")}`);
      } else if (result.unsupportedFeatures?.skills || result.targetScopeLimitations?.skills) {
         console.log(`Skipped ${result.editor}: user-scope skills are unavailable.`);
      } else {
         console.log(`Installed for ${result.editor}.`);
      }
   }
}
```

Call `installMyCliSkill()` from an explicit install subcommand to target all detected
editors, or pass editor names from flags. Call `removeMyCliSkill()` from a remove
subcommand to remove the skill from its recorded editors. To defer loading aix until
a subcommand needs it, use `await import("@a1st/aix-core")` inside the command.

## Install other items

```js
import { installMcpServer, installRule } from "@a1st/aix-core";

await installMcpServer({
   name: "my-cli",
   server: { command: "npx", args: ["-y", "my-cli", "mcp"] },
   scope: "user",
});

await installRule({
   name: "my-cli",
   rule: { description: "Using my-cli", content: "Run `my-cli check` before committing." },
   scope: "project",
   editors: ["cursor"],
});
```

| Install              | Remove              | Item-specific options                                                                      |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `installSkill`       | `removeSkill`       | `source` accepts a local directory, Git source, or npm reference.                          |
| `installMcpServer`   | `removeMcpServer`   | `server` accepts a command and arguments, or an HTTP URL with optional headers.            |
| `installRule`        | `removeRule`        | `rule` accepts inline content or a source reference.                                       |
| `installPrompt`      | `removePrompt`      | `prompt` accepts inline content or a source reference.                                     |
| `installAgent`       | `removeAgent`       | `agent` accepts an agent definition or a source reference.                                 |
| `installHook`        | `removeHook`        | Use `event` in place of `name`. On install, pass the list of matcher groups as `matchers`. |
| `installPlugin`      | `removePlugin`      | `plugin` accepts a plugin definition, source reference, or enabled flag.                   |
| `installMarketplace` | `removeMarketplace` | `marketplace` accepts the catalog source or a marketplace definition.                      |

A Git skill source can be `{ git: "https://github.com/me/my-cli", path: "skills/my-cli" }`.
See the [configuration reference](/configuration/ai-json-reference/) for the fields
accepted by each kind of item.

### Install items by type

Use `installItem({ type, name, config, scope, editors })` when your tool chooses the
item type at runtime. The supported types are `skill`, `mcp`, `rule`, `prompt`, `agent`,
`hook`, `plugin`, and `marketplace`. For example:

```js
import { installItem } from "@a1st/aix-core";

await installItem({
   type: "skill",
   name: "my-cli",
   config: { path: "./skills/my-cli" },
   scope: "user",
   editors: ["claude-code"],
});
```

Use `removeItem({ type, name, scope, editors })` to remove the item. For hooks, pass the
lifecycle event as `name` and the matcher groups as `config` on install.

## Shared options and results

| Option        | Description                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | The installed item's name. The named hook functions take `event` instead.                                                           |
| `scope`       | Required. Use `"user"` for home-directory config or `"project"` for project-local config.                                           |
| `projectRoot` | Defaults to the current working directory. Relative item paths resolve from here.                                                   |
| `editors`     | [Editor names](/editors/supported-editors/) or aliases. Installs default to detected editors. Removals default to recorded editors. |
| `dryRun`      | Return planned file changes without applying them.                                                                                  |

Install and remove functions return `{ editors, results }`, with one result per processed
editor. Each result includes `success`, `errors`, and `changes`. File changes have a
`path` and an `action` of `create`, `update`, `delete`, or `unchanged`. An editor
failure is reported in its result and processing continues with the other editors.
Invalid item config or editor names throw before installation.

Check `unsupportedFeatures`, `targetScopeLimitations`, and `globalChanges?.skipped`
before reporting an install as complete. An editor can skip an item and still return
`success: true`.

## What aix does to the user's files

- It backs up every file before it changes or deletes it. See
  [Backups and restore](/concepts/backups-and-restore/).
- It merges into shared files such as `~/.claude.json`, and leaves the other keys and the
  comments in them as they were.
- It records what it wrote in `~/.aix/` (or `.aix/` in the project). `removeItem` deletes
  only what that record lists. A skill of the same name that the user wrote, or that an
  `ai.json` installed, stays.
- The item shows up in `aix list`, and `aix remove` can remove it, for users who have aix.

## Test without touching your own editors

Set `AIX_USER_HOME` to a temporary directory. aix then reads and writes user-scope config
there. Detection looks in that directory too, so create an editor's directory in it to have
one detected:

```bash
export AIX_USER_HOME="$(mktemp -d)"
mkdir "$AIX_USER_HOME/.claude"
node ./bin/my-cli.js skill install
```

## Dependencies and bundling

`@a1st/aix-core` installs 17 other packages, about 4 MB on disk. The packages that download
git sources and npm packages are loaded only when an item needs them.

If you bundle your tool into one file, the simplest setup leaves `@a1st/aix-core` out of the
bundle as a normal dependency. It can be bundled: an esbuild bundle of the code above is
about 600 kB minified. One dependency, `jsonc-parser`, has a CommonJS default entry point that
does not work in an ESM bundle, so tell the bundler to prefer the ESM one:

```bash
esbuild src/cli.js --bundle --platform=node --format=esm --main-fields=module,main
```
