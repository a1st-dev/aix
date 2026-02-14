---
slug: cli/add
sidebar:
   order: 6
title: aix add
description: Add items to your configuration.
---

Adds skills, MCP servers, rules, or prompts to `ai.json` (or `ai.local.json`).

## Commands

### `aix add skill`

```bash
aix add skill <source> [flags]
```

**Flags:**

- `--name <name>` / `-n`: Override skill name.
- `--ref <ref>` / `-r`: Git branch/tag/commit.
- `--no-install`: Skip `aix install` after adding.
- `--local` / `-l`: Add to `ai.local.json`.

**Sources:**

- `react` (npm package `aix-skill-react`)
- `@scope/pkg`
- `github:user/repo`
- `./local/path`

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
- `--no-install`: Skip `aix install` after adding.
- `--local` / `-l`: Add to `ai.local.json`.

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
- `--no-install`: Skip `aix install` after adding.
- `--local` / `-l`: Add to `ai.local.json`.

### `aix add prompt`

```bash
aix add prompt <source> [flags]
```

**Flags:**

- `--name <name>` / `-n`: Prompt name.
- `--description <desc>` / `-d`: Command description.
- `--argument-hint <hint>`: Hint for user arguments.
- `--ref <ref>` / `-r`: Git branch/tag/commit.
- `--no-install`: Skip `aix install` after adding.
- `--local` / `-l`: Add to `ai.local.json`.
