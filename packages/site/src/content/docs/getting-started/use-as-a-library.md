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

The package is ESM-only and needs Node.js 20.19, or 22.12 and later.

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

`installItem` copies the skill to `~/.aix/skills/my-cli` and links it into the skills
directory of each editor:

```js
// src/agent-skill.js
import { fileURLToPath } from "node:url";
import { detectEditors, installItem, removeItem } from "@a1st/aix-core";

const skill = { section: "skills", name: "my-cli", scope: "user" },
   skillDir = fileURLToPath(new URL("../skills/my-cli", import.meta.url));

export function listDetectedEditors() {
   return detectEditors(process.cwd());
}

export function installSkill(editors) {
   return installItem({ ...skill, value: { path: skillDir }, editors });
}

export function removeSkill() {
   return removeItem(skill);
}
```

### Ask during setup

This setup step asks before it writes anything, and says where the skill went:

```js
import { createInterface } from "node:readline/promises";
import { installSkill, listDetectedEditors } from "./agent-skill.js";

export async function offerAgentSkill() {
   const editors = await listDetectedEditors();

   if (editors.length === 0 || !process.stdin.isTTY) {
      return;
   }

   const prompt = createInterface({ input: process.stdin, output: process.stdout }),
      answer = await prompt.question(`Install the my-cli skill for ${editors.join(", ")}? [Y/n] `);

   prompt.close();

   if (answer.trim().toLowerCase().startsWith("n")) {
      return;
   }

   const { results } = await installSkill(editors);

   for (const result of results) {
      console.log(
         result.success
            ? `Installed for ${result.editor}`
            : `${result.editor}: ${result.errors.join(", ")}`,
      );
   }
}
```

### Add subcommands

The same two functions work as `my-cli skill install` and `my-cli skill remove`. Running
the install again after an upgrade replaces the copy with the new version of the skill.

```js
import { installSkill, listDetectedEditors, removeSkill } from "./agent-skill.js";

export async function runSkillCommand(action) {
   const { results } =
      action === "remove" ? await removeSkill() : await installSkill(await listDetectedEditors());

   if (results.length === 0) {
      console.log(action === "remove" ? "The skill is not installed." : "No AI editor was found.");
   }

   for (const result of results) {
      console.log(`${result.editor}: ${result.success ? "done" : result.errors.join(", ")}`);
   }

   process.exitCode = results.every((result) => result.success) ? 0 : 1;
}
```

To keep your CLI's startup time unchanged, load the library only in the commands that use
it: `const { installItem } = await import('@a1st/aix-core')`.

## Install other config

`section` is a section of `ai.json`, `name` is the key in that section, and `value` is what
`ai.json` would have under that key. Every form in the
[ai.json reference](/configuration/ai-json-reference/) works.

```js
import { installItem } from "@a1st/aix-core";

// An MCP server
await installItem({
   section: "mcp",
   name: "my-cli",
   value: { command: "npx", args: ["-y", "my-cli", "mcp"] },
   scope: "user",
});

// A rule, from text or from a file
await installItem({
   section: "rules",
   name: "my-cli",
   value: { description: "Using my-cli", content: "Run `my-cli check` before committing." },
   scope: "project",
});
```

A skill `value` can also be a git source, such as
`{ git: 'https://github.com/me/my-cli', path: 'skills/my-cli' }`. aix downloads it at install
time.

## Options

`installItem(options)` and `removeItem(options)` take the same options. `removeItem` has no
`value`.

| Option        | Type                    | Description                                                                                                                                                  |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `section`     | string                  | `skills`, `mcp`, `rules`, `prompts`, `agents`, `hooks`, `plugins`, or `marketplaces`.                                                                        |
| `name`        | string                  | The item's key in its section. For `hooks`, the hook event, with the list of matchers as `value`.                                                            |
| `value`       | object or string        | The item, in the form `ai.json` uses. An invalid value throws before anything is written.                                                                    |
| `scope`       | `'user'` or `'project'` | `user` writes under the home directory, for every project. `project` writes into `projectRoot`. See [User scope and project scope](/concepts/scopes/).       |
| `projectRoot` | string                  | Defaults to the current working directory. Relative paths in `value` are resolved from here.                                                                 |
| `editors`     | string[]                | [Editor names](/editors/supported-editors/). `installItem` defaults to the detected editors. `removeItem` defaults to the editors the item was installed to. |
| `dryRun`      | boolean                 | Return the planned file changes without writing.                                                                                                             |

Both return `{ editors, results }`. `editors` is empty when there was nothing to do: no
editor was detected, or the item was never installed. `results` has one entry per editor:

- `success` and `errors`: whether the editor's files were written, and why not. A failure in
  one editor does not stop the others, and the functions do not throw for it.
- `changes`: every file with its `path` and `action` (`create`, `update`, `delete`, or
  `unchanged`).
- `unsupportedFeatures` and `targetScopeLimitations`: set when the editor cannot take the
  item at all, or not at the requested scope. For example, some editors have no user-level
  rules. `success` is still `true` in that case, so check these when you report the outcome.

`detectEditors(projectRoot)` returns the editors installed on the machine, and
`getAvailableEditors()` returns every editor aix supports.

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

`@a1st/aix-core` installs 16 other packages, about 4 MB on disk. The packages that download
git sources and npm packages are loaded only when a `value` needs them.

If you bundle your tool into one file, the simplest setup leaves `@a1st/aix-core` out of the
bundle as a normal dependency. It can be bundled: an esbuild bundle of the code above is
about 670 kB minified. Some of its dependencies are CommonJS, so an ESM bundle needs the ESM
entry points and a `require` function:

```bash
esbuild src/cli.js --bundle --platform=node --format=esm --main-fields=module,main \
   --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
```
