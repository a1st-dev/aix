---
slug: cli/global
sidebar:
   order: 11
title: aix global
description: Manage global tracking for editors.
---

Some editors (like Windsurf, Zed, and Codex) require using a shared global configuration file for MCP servers. `aix` tracks which project added which server to ensure they aren't removed while still in use by another project.

## Commands

### `aix global list`

List all globally tracked configurations, showing the editor, resource type, name, and count of projects depending on it.

### `aix global cleanup`

Find and remove "orphaned" entries—servers that are tracked in the global config but whose originating project directory no longer exists.

**Flags:**

- `--dry-run`: Show what would be removed.
- `--force` / `-f`: Remove without confirmation.
