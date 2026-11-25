---
sidebar:
   order: 3
title: aix add
description: Install one item into your editors, and optionally save it to ai.json.
---

Installs a skill, MCP server, rule, prompt, agent, hook, plugin, or marketplace into your
editors. On its own, `aix add` does not read or change `ai.json`. Pass `--save` to also write
the item to `ai.json`.

## Usage

```bash
aix add <type> <source> [flags]
```

`<type>` is one of `skill`, `mcp`, `rule`, `prompt`, `agent`, `hook`, `plugin`, or
`marketplace`. Each type is described under [Commands](#commands).

## What add does

### Without `--save`

aix installs the item into editor config and leaves `ai.json` alone. It installs to the
editors named by `--target`, or to every editor it detects when you pass none.

If no editor is found, nothing is installed and aix prints:

```text
Not installed to any editor: none was detected. Pass --target <editor> to choose one.
```

### With `--save`

aix writes the item to `ai.json` first and then installs it:

- If aix finds an `ai.json` in the working directory or a parent directory, it adds the item
  to that file and installs that section of the file. It installs to the editors named by
  `--target`, or to the editors listed in the `editors` field, or to every detected editor
  when `ai.json` lists none.
- If there is no `ai.json`, aix creates one in the working directory and installs the item to
  the editors named by `--target`, or to every detected editor.

With `--local`, the item is written to `ai.local.json` beside `ai.json`, and only that item
is installed.

`--config-only` writes the config file and skips the install, so you can review the change
and run [`aix install`](/cli/install/) yourself.

### Scope

`aix add` installs at user scope unless you pass `--project` or `--scope project`. With
`--save` it follows the `scope` field of the `ai.json` it loads when no scope flag is passed.
A project-scope add leaves config that an editor only reads at user scope alone, such as
Windsurf and Codex MCP servers. See [User scope and project scope](/concepts/scopes/).

## Shared flags

Every `aix add` command takes these flags:

| Flag                                                     | Description                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--save` / `-s`                                          | Also write the item to `ai.json`.                                                          |
| `--local` / `-l`                                         | With `--save`, write to `ai.local.json` instead of `ai.json`.                              |
| `--config-only`                                          | With `--save`, write the config file and skip the install.                                 |
| `--lock`                                                 | With `--save`, create or refresh `ai.lock.json` after adding. Needs an existing `ai.json`. |
| `--target <editor>` / `-t`                               | Install to this editor only. Repeatable.                                                   |
| `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`) | Install at user scope or project scope. The default is user scope.                         |

`--local`, `--lock`, and `--config-only` are rejected without `--save`, and `--scope` cannot
be combined with `--user` or `--project`. `--no-install` is another spelling of
`--config-only`. When `ai.lock.json` already exists, `--save` refreshes it whether or not you
pass `--lock`.

The [global flags](/cli/overview/#global-flags) also apply. `--config` is only read with
`--save`.

## Commands

### `aix add skill`

```bash
aix add skill <source>... [flags]
```

**Flags:**

- `--name <name>` / `-n`: Use this name in place of the one inferred from the source.
- `--ref <ref>` / `-r`: Git branch, tag, or commit. Overrides a ref in the URL.

**Sources:**

- `react` (npm package `aix-skill-react`)
- `@scope/pkg`
- `github:user/repo`
- `owner/repo/path-to-skill`
- `https://github.com/org/repo/tree/main/skills/my-skill`
- `https://github.com/org/repo/blob/main/skills/my-skill/SKILL.md`
- `./local/path`

You can pass several sources at once. `--name` and `--ref` only work with one source.

A skill is copied into `~/.aix/skills/{name}/` at user scope, or `.aix/skills/{name}/` in the
project at project scope. Each editor's skill directory is then linked to that copy. See
[Skills](/concepts/skills/).

### `aix add mcp`

```bash
aix add mcp <name> [flags]
```

**Flags:**

- `--command <cmd>`: Command to run for a stdio server.
- `--args <args>`: Comma-separated arguments for the command.
- `--env <vars>`: Environment variables (`KEY=value,KEY2=value2`).
- `--url <url>`: URL of a remote server.

Without `--command` or `--url`, aix searches the
[MCP Registry](https://registry.modelcontextprotocol.io) for `<name>`. With one match, aix
uses it. With several matches, aix asks which server to use. Without a terminal it cannot
ask, so the command fails and lists the matching servers.

### `aix add rule`

```bash
aix add rule <source>... [flags]
```

`<source>` is the rule text itself, a local file path, or a git URL.

**Flags:**

- `--name <name>` / `-n`: Rule name. Inferred from the source when omitted.
- `--activation <mode>` / `-a`: `always` (the default), `auto`, `glob`, or `manual`.
- `--globs <patterns>` / `-g`: Comma-separated file patterns for `glob` activation.
- `--description <desc>` / `-d`: When the rule should apply, for `auto` activation.
- `--ref <ref>` / `-r`: Git branch, tag, or commit.

`--name`, `--description`, and `--ref` only work with one source.

### `aix add prompt`

```bash
aix add prompt <source>... [flags]
```

`<source>` is the prompt text itself, a local file path, or a git URL.

**Flags:**

- `--name <name>` / `-n`: Prompt name. Inferred from the source when omitted.
- `--description <desc>` / `-d`: Description shown in the editor's command picker.
- `--argument-hint <hint>` / `-a`: Hint for the arguments, such as `[file] [message]`.
- `--ref <ref>` / `-r`: Git branch, tag, or commit.

These four flags only work with one source.

### `aix add agent`

```bash
aix add agent <source> [flags]
```

`<source>` is a local `.md` or `.agent.md` file, a git URL, a git shorthand, or an npm package
name.

**Flags:**

- `--name <name>` / `-n`: Agent name. Inferred from the file name when omitted.
- `--mode <mode>` / `-m`: `subagent` (the default) or `primary`.
- `--model <model>`: Model alias or model ID.
- `--tools <tools>`: Comma-separated list of tools available to the agent.
- `--description <desc>` / `-d`: When this agent should be used.
- `--ref <ref>` / `-r`: Git branch, tag, or commit.

You can pass several sources at once. `--name`, `--model`, `--tools`, `--description`, and
`--ref` only work with one source.

**Examples:**

```bash
aix add agent ./agents/reviewer.md
aix add agent ./agents/reviewer.agent.md --mode primary
aix add agent github:org/agents/tester.md --model claude-3-7-sonnet --tools bash,edit
```

### `aix add hook`

```bash
aix add hook <event> [flags]
aix add hook <source> [flags]
```

Pass a [hook event](/concepts/hooks/) name to describe the hook inline, or a path, URL, or
npm/git reference to a JSON hook fragment. A new hook joins whatever is already registered
for that event instead of replacing it.

**Flags (event form):**

- `--command <cmd>`: Shell command to run when the event fires.
- `--url <url>`: URL to POST the hook payload to (`http` action).
- `--prompt <text>`: Prompt text for an LLM-evaluated hook.
- `--type <kind>`: `command`, `http`, `prompt`, or `agent`. Inferred from the flag above when omitted.
- `--matcher <pattern>` / `-m`: Pattern selecting which tools or actions the hook applies to.
- `--timeout <seconds>`: Timeout in seconds.
- `--description <desc>` / `-d`: Free-form description for the hook group.

Pass exactly one of `--command`, `--url`, and `--prompt`.

**Flags (fragment form):**

- `--name <name>` / `-n`: Fragment name, when it cannot be inferred from the source.
- `--ref <ref>` / `-r`: Git branch, tag, or commit.

The event-form flags are rejected with a fragment, and the fragment-form flags are rejected
with an event name.

**Examples:**

```bash
aix add hook pre_command --command "npm run lint"
aix add hook pre_file_write --matcher "Write|Edit" --command ./scripts/guard.sh
aix add hook agent_stop --prompt "Summarize what changed" --type agent
aix add hook ./hooks/guard.json
```

A fragment names its event alongside the actions:

```json
{
   "event": "pre_file_write",
   "matcher": "Write|Edit",
   "hooks": [{ "command": "./scripts/guard.sh", "timeout": 10 }]
}
```

### `aix add plugin`

```bash
aix add plugin <source>... [flags]
```

`<source>` is a plugin name, a `name@marketplace` pair, an npm package, or a local path.

**Flags:**

- `--name <name>` / `-n`: Use this plugin name in place of the inferred one.
- `--marketplace <name>` / `-m`: Marketplace the plugin is published in.

Both flags only work with one source.

**Examples:**

```bash
aix add plugin code-review
aix add plugin code-review@claude-plugins-official
aix add plugin code-review --marketplace custom-market
aix add plugin ./plugins/local-plugin --name my-plugin
```

### `aix add marketplace`

```bash
aix add marketplace <source>... [flags]
```

Registers a plugin marketplace with your editors. `<source>` is a git URL, a git shorthand,
or a local directory.

**Flags:**

- `--name <name>` / `-n`: Marketplace name. Inferred from the URL or repository when omitted.
- `--description <desc>` / `-d`: Description of the marketplace.

Both flags only work with one source.

**Examples:**

```bash
aix add marketplace https://github.com/anthropics/claude-plugins-official --name claude-plugins-official
```

## Exit status

The command exits with a non-zero status when the install fails for an editor.

## Examples

**Install an MCP server into every detected editor at user scope:**

```bash
aix add mcp playwright --command "npx @playwright/mcp@latest"
```

**Install a rule into one editor at project scope:**

```bash
aix add rule ./rules/typescript.md --target cursor --project
```

**Save a skill to `ai.json` without installing it:**

```bash
aix add skill ./skills/review --save --config-only
```

**Save a personal rule to `ai.local.json`:**

```bash
aix add rule "Explain changes in plain language" --name my-notes --save --local
```
