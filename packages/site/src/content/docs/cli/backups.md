---
slug: cli/backups
sidebar:
   order: 12
title: aix backups
description: View and manage configuration backups.
---

Configuring editors can be destructive. `aix` creates backups of every file it modifies before writing to it.

## Backup Locations

- **Local**: `.aix/.tmp/backups/` — Backups of files within your project.
- **Global**: `~/.aix/backups/` — Backups of global editor config files (e.g., Windsurf's `mcp_config.json`).

## Commands

### `aix backups`

List all available backups.

## Automatic Cleanup

Backups are automatically cleaned up based on the settings in `ai.json`:

```json
{
   "aix": {
      "cache": {
         "maxBackups": 5,
         "maxBackupAgeDays": 30
      }
   }
}
```
