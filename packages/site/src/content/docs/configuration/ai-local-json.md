---
slug: configuration/ai-local-json
sidebar:
   order: 2
title: ai.local.json
description: Use local configuration overrides for secrets and developer-specific settings.
---

`ai.local.json` is a companion file to `ai.json` designed for configuration that should **not** be shared with your team or committed to version control.

## Usage

Create a file named `ai.local.json` in the same directory as your `ai.json`:

```json
{
   "mcp": {
      "github": {
         "env": {
            "GITHUB_TOKEN": "ghp_my_secret_token"
         }
      }
   }
}
```

When you run `aix install`, settings in `ai.local.json` are merged **on top** of `ai.json`.

## Best Practices

### 1. Ignore it in git

Always add `ai.local.json` to your `.gitignore`:

```text
# .gitignore
ai.local.json
.aix/
```

### 2. Store secrets here

Do not put API keys or tokens in `ai.json`. Instead, reference environment variables (`${VAR}`) in `ai.json` and set them in your shell, OR define them directly in `ai.local.json`.

### 3. Developer preferences

Use `ai.local.json` to enable or disable tools locally without affecting teammates.

**Example: turning off a noisy linter rule locally**

```json
// ai.local.json
{
   "rules": {
      "strict-linting": false
   }
}
```

## Restrictions

Unlike the main `ai.json`, `ai.local.json` does **not** support the `extends` field. It is designed to be a flat patch file, not part of a complex inheritance chain.

## CLI Support

Most aix commands support a `--local` (or `-l`) flag to operate on the local config instead of the shared one.

```bash
# Add an MCP server to local config only
aix add mcp github --local

# Remove a rule from local config only
aix remove rule strict-linting --local
```
