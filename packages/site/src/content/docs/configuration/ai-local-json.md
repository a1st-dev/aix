---
sidebar:
   order: 2
title: ai.local.json
description: Use local configuration overrides for secrets and developer-specific settings.
---

`ai.local.json` is a companion file to `ai.json` for configuration that should not be shared
with your team or committed to version control.

## Usage

Create a file named `ai.local.json` in the same directory as your `ai.json`:

```json
{
   "mcp": {
      "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": {
            "GITHUB_TOKEN": "ghp_my_secret_token"
         }
      }
   }
}
```

When aix loads your config, entries in `ai.local.json` are applied on top of `ai.json`.

An entry in `ai.local.json` replaces the entry with the same name in `ai.json` as a whole. The
two are not merged field by field, so the example above repeats `command` and `args` instead
of listing only `env`. Setting an entry to `false` removes it.

## Best practices

### Ignore it in git

Add `ai.local.json` to your `.gitignore`, along with everything in `.aix/` except
`.aix/imported/`:

```text
# .gitignore
ai.local.json
.aix/*
!.aix/imported/
```

`.aix/imported/` holds the rule, prompt, and agent files that
[`aix init --from`](/getting-started/import-from-editor/) creates. `ai.json` refers to them by
path, so commit that directory or teammates' installs will fail on the missing files.

The rest of `.aix/` is rebuilt by aix or is specific to your machine: `.aix/.tmp/` holds
the cache, `.aix/skills/` and `.aix/extends/` hold copies of resolved skills and extended
configs, and `.aix/installs/` and `.aix/state.json` record what aix installed. See
[What aix writes and where](/concepts/files-and-directories/).

### Store secrets here

Do not put API keys or tokens in `ai.json`. Reference environment variables (`${VAR}`) in
`ai.json` and set them in your shell, or define the values directly in `ai.local.json`.

### Developer preferences

Use `ai.local.json` to turn items on or off for yourself without affecting teammates.

This example turns off a shared rule locally:

```json
// ai.local.json
{
   "rules": {
      "strict-linting": false
   }
}
```

## Restrictions

Unlike `ai.json`, `ai.local.json` does not support the `extends` field. aix rejects a local
file that contains it.

## CLI support

`aix add` and `aix remove` take a `--local` (or `-l`) flag that makes `--save` write to
`ai.local.json` instead of `ai.json`. `--local` needs `--save`, and `aix add` rejects it
otherwise.

```bash
# Save a personal rule to ai.local.json
aix add rule "Explain changes in plain language" --name my-notes --save --local

# Remove it from ai.local.json again
aix remove rule my-notes --save --local
```
