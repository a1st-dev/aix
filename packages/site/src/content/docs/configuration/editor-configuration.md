---
slug: configuration/editor-configuration
sidebar:
   order: 4
title: Editor Configuration
description: Configure target editors and editor-specific settings.
---

By default, `aix install` detects all supported editors installed on your system and syncs configuration to them. You can control this behavior and pass editor-specific settings using the `editors` field.

## Limiting Installation

To only install to specific editors, provide an array of strings:

```json
{
   "editors": ["cursor", "vscode"]
}
```

Or use the object form:

```json
{
   "editors": {
      "cursor": { "enabled": true },
      "vscode": { "enabled": true },
      "windsurf": { "enabled": false }
   }
}
```

## Editor-Specific Settings

The object form allows you to pass additional configuration to specific editors.

### Windsurf

Windsurf (by Codeium) supports "Cascade" settings.

```json
{
   "editors": {
      "windsurf": {
         "enabled": true,
         "cascadeSettings": {
            "mcp": {
               "globalEnabled": true
            }
         }
      }
   }
}
```

### Cursor

Cursor has its own AI settings block.

```json
{
   "editors": {
      "cursor": {
         "enabled": true,
         "aiSettings": {
            // Cursor specific settings
         }
      }
   }
}
```

### Claude Code

Configure permissions for the Claude Code CLI tool.

```json
{
   "editors": {
      "claude-code": {
         "enabled": true,
         "permissions": {
            "allow-file-access": true
         }
      }
   }
}
```

## Editor-Specific Rules

Sometimes you need to give instructions to one specific AI model but not others. You can define rules nested under the editor config:

```json
{
   "editors": {
      "cursor": {
         "rules": {
            "cursor-shortcuts": {
               "content": "Use cmd+k for inline edits..."
            }
         }
      }
   }
}
```

Rules defined here will **only** be written to that editor's configuration.
