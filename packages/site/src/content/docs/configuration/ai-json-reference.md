---
slug: configuration/ai-json-reference
sidebar:
   order: 1
title: ai.json Reference
description: Complete reference for every field in the ai.json configuration file.
---

`ai.json` is the single configuration file that aix uses to sync your AI editor settings. It supports JSONC (comments and trailing commas).

## Schema

Add the `$schema` field for IDE autocompletion and inline validation:

```json
{
   "$schema": "https://x.a1st.dev/schemas/v1/ai.json"
}
```

## Top-level fields

| Field     | Type                 | Description                                   |
| --------- | -------------------- | --------------------------------------------- |
| `$schema` | `string`             | JSON Schema URL for IDE validation            |
| `extends` | `string \| string[]` | Inherit from other configs                    |
| `skills`  | `object`             | Map of skill names to skill references        |
| `mcp`     | `object`             | Map of server names to MCP server configs     |
| `rules`   | `object`             | Map of rule names to rule definitions         |
| `prompts` | `object`             | Map of prompt names to prompt definitions     |
| `editors` | `object \| string[]` | Editor targeting and editor-specific settings |
| `hooks`   | `object`             | Lifecycle hooks for AI agent events           |
| `aix`     | `object`             | aix tool settings (cache, backups)            |

---

## `extends`

Inherit from other configurations. Supports a single string or an array. Configs are resolved and deep-merged in order — later entries override earlier ones.

```json
{
   "extends": "github:company/ai-config"
}
```

```json
{
   "extends": ["@company/aix-base", "github:team/project-overrides", "./local-overrides.json"]
}
```

Source types:

- **npm package**: `"@company/aix-config"` or `"aix-config-react"`
- **Git shorthand**: `"github:user/repo"`, `"gitlab:org/repo#v2.0"`
- **URL**: `"https://raw.githubusercontent.com/..."`
- **Local path**: `"./configs/base.json"`

See [Config Inheritance](/configuration/config-inheritance/) for merge semantics.

---

## `skills`

Map of skill names to skill references. Skill names must be lowercase alphanumeric with hyphens (max 64 characters). See [Skills](/concepts/skills/) for the full concept.

### String shorthand

```json
{
   "skills": {
      "react": "^1.0.0",
      "custom": "./skills/custom",
      "remote": "github:user/skills#v2.0"
   }
}
```

### Object form

```json
{
   "skills": {
      "react": {
         "source": {
            "git": "github:user/repo",
            "ref": "v2.0",
            "path": "skills/react"
         },
         "enabled": true,
         "config": {
            "framework": "nextjs"
         }
      }
   }
}
```

### Disable an inherited skill

```json
{
   "skills": {
      "inherited-skill": false
   }
}
```

---

## `mcp`

Map of server names to MCP server configurations. See [MCP Servers](/concepts/mcp-servers/) for the full concept.

### Stdio transport

```json
{
   "mcp": {
      "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         },
         "cwd": ".",
         "shell": false
      }
   }
}
```

| Field     | Type       | Default | Description                                              |
| --------- | ---------- | ------- | -------------------------------------------------------- |
| `command` | `string`   | —       | Command to run                                           |
| `args`    | `string[]` | `[]`    | Command arguments                                        |
| `env`     | `object`   | `{}`    | Environment variables. Use `${VAR}` for shell expansion. |
| `cwd`     | `string`   | `.`     | Working directory                                        |
| `shell`   | `boolean`  | `false` | Run in a shell                                           |

### HTTP transport

```json
{
   "mcp": {
      "remote-server": {
         "url": "https://example.com/mcp",
         "headers": {
            "Authorization": "Bearer ${TOKEN}"
         },
         "timeout": 30000
      }
   }
}
```

| Field            | Type      | Default | Description                        |
| ---------------- | --------- | ------- | ---------------------------------- |
| `url`            | `string`  | —       | MCP endpoint URL (Streamable HTTP) |
| `headers`        | `object`  | `{}`    | Request headers                    |
| `timeout`        | `number`  | —       | Connection timeout in ms           |
| `validateOrigin` | `boolean` | `true`  | Validate server origin             |

### Common options

These fields apply to both transport types:

| Field              | Type                 | Default | Description                                                                            |
| ------------------ | -------------------- | ------- | -------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`            | `true`  | Enable/disable the server                                                              |
| `tools`            | `string[] \| object` | —       | Tool access control. Array of allowed tool names, or `{ include: [], exclude: [] }`.   |
| `disabledTools`    | `string[]`           | —       | Tool names to disable                                                                  |
| `resources`        | `string[] \| object` | —       | Resource access control. Array of allowed patterns, or `{ include: [], exclude: [] }`. |
| `autoStart`        | `boolean`            | `true`  | Start with editor                                                                      |
| `restartOnFailure` | `boolean`            | `true`  | Auto-restart on crash                                                                  |
| `maxRestarts`      | `number`             | `3`     | Max restart attempts                                                                   |

### Disable an inherited server

```json
{
   "mcp": {
      "inherited-server": false
   }
}
```

---

## `rules`

Map of rule names to rule definitions. See [Rules](/concepts/rules/).

### String shorthand

```json
{
   "rules": {
      "code-style": "./rules/style.md",
      "remote-rule": "github:company/rules#main/typescript.md"
   }
}
```

### Object form

```json
{
   "rules": {
      "code-style": {
         "activation": "always",
         "content": "Always use TypeScript strict mode."
      },
      "testing": {
         "activation": "glob",
         "globs": ["**/*.test.ts", "**/*.spec.ts"],
         "path": "./rules/testing.md"
      },
      "security": {
         "activation": "auto",
         "description": "Apply when working on authentication or authorization code.",
         "path": "./rules/security.md"
      }
   }
}
```

| Field         | Type       | Default    | Description                                        |
| ------------- | ---------- | ---------- | -------------------------------------------------- |
| `activation`  | `string`   | `"always"` | `"always"`, `"auto"`, `"glob"`, or `"manual"`      |
| `description` | `string`   | —          | When the rule applies (required for `"auto"` mode) |
| `globs`       | `string[]` | —          | File patterns (required for `"glob"` mode)         |
| `content`     | `string`   | —          | Inline rule text                                   |
| `path`        | `string`   | —          | Path to a markdown file                            |
| `git`         | `object`   | —          | `{ url, ref, path }` for git-hosted rules          |
| `npm`         | `object`   | —          | `{ npm, path, version }` for npm-hosted rules      |

One source field (`content`, `path`, `git`, or `npm`) is required.

---

## `prompts`

Map of prompt names to prompt definitions. See [Prompts](/concepts/prompts/).

### String shorthand

```json
{
   "prompts": {
      "review": "./prompts/review.md",
      "plan": "./prompts/plan.md"
   }
}
```

### Object form

```json
{
   "prompts": {
      "review": {
         "description": "Review code changes for quality issues",
         "argumentHint": "[file] [message]",
         "path": "./prompts/review.md"
      }
   }
}
```

| Field          | Type     | Description                                     |
| -------------- | -------- | ----------------------------------------------- |
| `description`  | `string` | Shown in the editor's command picker            |
| `argumentHint` | `string` | Hint for arguments (e.g., `"[file] [message]"`) |
| `content`      | `string` | Inline prompt text                              |
| `path`         | `string` | Path to a markdown file                         |
| `git`          | `object` | `{ url, ref, path }` for git-hosted prompts     |
| `npm`          | `object` | `{ npm, path, version }` for npm-hosted prompts |

---

## `editors`

Configure which editors to install to and provide editor-specific settings.

### Array shorthand

```json
{
   "editors": ["cursor", "copilot", "claude-code"]
}
```

### Object form

```json
{
   "editors": {
      "cursor": {
         "enabled": true,
         "rules": {
            "cursor-only": {
               "content": "Cursor-specific instructions here"
            }
         },
         "aiSettings": {}
      },
      "windsurf": {
         "enabled": true,
         "cascadeSettings": {}
      },
      "claude-code": {
         "enabled": true,
         "permissions": {}
      }
   }
}
```

If `editors` is omitted, aix auto-detects installed editors at install time. See [Editor Configuration](/configuration/editor-configuration/).

---

## `hooks`

Lifecycle hooks for AI agent events. See [Hooks](/concepts/hooks/).

```json
{
   "hooks": {
      "session_start": [
         {
            "matcher": ".*",
            "hooks": [
               {
                  "command": "echo 'Session started'",
                  "timeout": 5,
                  "show_output": true
               }
            ]
         }
      ]
   }
}
```

---

## `aix`

Settings for the aix tool itself. These don't affect AI editor behavior.

```json
{
   "aix": {
      "cache": {
         "maxBackups": 5,
         "maxBackupAgeDays": 30,
         "maxCacheAgeDays": 7
      }
   }
}
```

| Field                    | Type     | Default | Range | Description                   |
| ------------------------ | -------- | ------- | ----- | ----------------------------- |
| `cache.maxBackups`       | `number` | `5`     | 1–100 | Max backup files to keep      |
| `cache.maxBackupAgeDays` | `number` | `30`    | 1–365 | Max backup age before cleanup |
| `cache.maxCacheAgeDays`  | `number` | `7`     | 1–365 | Max cache age before cleanup  |
