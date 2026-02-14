---
slug: cli/config
sidebar:
   order: 9
title: aix config
description: View and modify raw configuration values.
---

Interact with config values using dot-notation keys.

## Commands

### `aix config show`

Show the full configuration.

**Flags:**

- `--resolved` / `-r`: Show the final merged config (after `extends` and `ai.local.json`).

### `aix config get`

Get a specific value.

```bash
aix config get mcp.github.env
```

### `aix config set`

Set a value. JSON strings are automatically parsed.

```bash
aix config set rules.my-rule.activation auto
```
