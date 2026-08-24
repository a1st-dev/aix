---
sidebar:
   order: 6
title: aix add
description: Add items to your configuration.
---

Adds skills, MCP servers, rules, prompts, or hooks to `ai.json` (or `ai.local.json`) and installs them to editors in one step. If no `ai.json` exists in the current directory, the item is installed directly to editors without modifying any config file.

## Commands

### `aix add skill`

```bash
aix add skill <source> [flags]
```

**Flags:**

- `--name <name>` / `-n`: Override skill name.
- `--ref <ref>` / `-r`: Git branch/tag/commit.
- `--no-install`: Skip the install step after adding.
- `--local` / `-l`: Add to `ai.local.json`.
- `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`): Target user-level or project-level config.

**Sources:**

- `react` (npm package `aix-skill-react`)
- `@scope/pkg`
- `github:user/repo`
- `owner/repo/path-to-skill`
- `https://github.com/org/repo/tree/main/skills/my-skill`
- `https://github.com/org/repo/blob/main/skills/my-skill/SKILL.md`
- `./local/path`

`aix add skill` stores native aix skill references in `ai.json` and installs skills through aix's own resolver/installer flow. Skills are copied into `.aix/skills/{name}/`, then symlinked into editors with native skill support.

### `aix add mcp`

```bash
aix add mcp <name> [flags]
```

If no command/url is provided, it searches the registry.

**Flags:**

- `--command <cmd>`: Command to run (stdio).
- `--args <args>`: Command arguments.
- `--url <url>`: HTTP/SSE URL.
- `--env <vars>`: Environment variables (`KEY=val,KEY2=val`).
- `--no-install`: Skip the install step after adding.
- `--local` / `-l`: Add to `ai.local.json`.
- `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`): Target user-level or project-level config.

### `aix add rule`

```bash
aix add rule <source> [flags]
```

**Flags:**

- `--name <name>` / `-n`: Rule name.
- `--activation <mode>` / `-a`: `always`, `auto`, `glob`, or `manual`.
- `--globs <patterns>` / `-g`: Glob patterns (comma separated).
- `--description <desc>` / `-d`: Description for auto-activation.
- `--ref <ref>` / `-r`: Git branch/tag/commit.
- `--no-install`: Skip the install step after adding.
- `--local` / `-l`: Add to `ai.local.json`.
- `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`): Target user-level or project-level config.

### `aix add prompt`

```bash
aix add prompt <source> [flags]
```

**Flags:**

- `--name <name>` / `-n`: Prompt name.
- `--description <desc>` / `-d`: Command description.
- `--argument-hint <hint>`: Hint for user arguments.
- `--ref <ref>` / `-r`: Git branch/tag/commit.
- `--no-install`: Skip the install step after adding.
- `--local` / `-l`: Add to `ai.local.json`.
- `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`): Target user-level or project-level config.

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

**Flags (fragment form):**

- `--name <name>` / `-n`: Fragment name, when it cannot be inferred from the source.
- `--ref <ref>` / `-r`: Git branch/tag/commit.

**Shared flags:**

- `--no-install`: Skip the install step after adding.
- `--local` / `-l`: Add to `ai.local.json`.
- `--scope <scope>` / `--user` (`-u`) / `--project` (`-p`): Target user-level or project-level config.

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
