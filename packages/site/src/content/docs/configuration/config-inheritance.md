---
slug: configuration/config-inheritance
sidebar:
   order: 3
title: Config Inheritance
description: Share and layer configurations using the extends field.
---

aix allows you to inherit configuration from other sources using the `extends` field in `ai.json`. This enables organizations to maintain shared "base" configurations (with standard rules, skills, and MCP servers) while allowing individual projects to add their own.

## Usage

The `extends` field accepts a string or an array of strings.

```json
{
   "extends": "github:my-org/ai-standards"
}
```

Multiple sources are supported. They are processed in order, with later configurations overriding earlier ones:

```json
{
   "extends": [
      // 1. Base company standards
      "github:company/ai-base",

      // 2. Team specific overrides
      "github:team-platform/ai-config",

      // 3. Local file mixin
      "./configs/react-project.json"
   ]
}
```

The final configuration is the result of merging all extended configs into your project's `ai.json`.

## Source Types

aix supports extending from:

### npm packages

```json
{ "extends": "@company/aix-config" }
```

The package must export an `ai.json` (or have one in its root).

### Git repositories

Use the shorthand syntax `provider:user/repo`:

```json
{ "extends": "github:company/repo" }
```

You can target a specific branch, tag, or commit hash:

```json
{ "extends": "github:company/repo#v2.0.0" }
```

If the config file is not at the root of the repo, use the `path` query param (not supported in shorthand yet, so use full URL or ensure it's at root/`ai.json` for now).

### URLs

Direct HTTP/HTTPS URLs to a JSON file:

```json
{ "extends": "https://raw.githubusercontent.com/user/repo/main/ai.json" }
```

### Local paths

Relative paths to other JSON files:

```json
{ "extends": "../shared/ai.json" }
```

## Merge Logic

When merging configurations:

1. **Object maps**: `skills`, `mcp`, `rules`, and `prompts` are merged by key. Keys in your `ai.json` overwrite keys from `extends`.
2. **Editors**: Normalized to object form and deep-merged. Remote editor settings are merged into local ones per editor key.
3. **Metadata**: `$schema` and `extends` from the remote config win.
4. **Disabling**: You can disable an inherited item by setting it to `false`.
5. **Not inherited**: `hooks` and `aix` settings are not inherited from extended configs.

**Example: Disabling an inherited rule**

Base config (`github:company/base`):

```json
{
   "rules": {
      "always-add-tests": { "content": "..." }
   }
}
```

Your config:

```json
{
   "extends": "github:company/base",
   "rules": {
      "always-add-tests": false
   }
}
```

## Resolution Process

1. references in `extends` are resolved and downloaded (cached in `.aix/cache`).
2. Configs are loaded in order.
3. Recursive `extends` are resolved (a config can extend another config).
4. All configs are merged into a single "resolved" configuration.
5. Your local `ai.json` is applied last.
6. `ai.local.json` (if present) is applied on top.

To see the final result of this process, run:

```bash
aix config show --resolved
```
