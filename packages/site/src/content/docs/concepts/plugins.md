---
sidebar:
   order: 70
title: Plugins and marketplaces
description: Manage AI editor plugins, marketplaces, and compatibility unpacking across editors.
---

**Plugins** bundle skills, rules, hooks, and MCP servers into one installable unit.
**Marketplaces** are catalogs that plugins are published in.

You list plugins and marketplaces in `ai.json`. For editors with their own plugin system, aix
writes the editor's plugin configuration. For the others, aix can unpack a local plugin into
its parts and install those instead.

## Configuration

Add plugins and marketplaces to `ai.json`:

```json
{
   "plugins": {
      "skill-creator@claude-plugins-official": true,
      "custom-tools": {
         "source": "./plugins/custom-tools",
         "enabled": true
      }
   },
   "marketplaces": {
      "claude-plugins-official": "https://github.com/anthropics/claude-plugins-official",
      "team-marketplace": {
         "source": "https://github.com/my-org/marketplace"
      }
   }
}
```

A plugin key is a plugin name, optionally followed by `@` and the marketplace it comes from.
Its value is `true`, a source string, or an object with `source`, `enabled`, and `options`.
Set a plugin or marketplace to `false` to disable one you inherit through `extends`.

### CLI commands

```bash
# Add a marketplace
aix add marketplace https://github.com/anthropics/claude-plugins-official --name claude-plugins-official

# Add a plugin from a marketplace or local path
aix add plugin skill-creator@claude-plugins-official
aix add plugin ./plugins/custom-tools --name custom-tools

# List the plugins and marketplaces your editors hold
aix list plugins
aix list marketplaces

# Remove a plugin or marketplace
aix remove plugin skill-creator@claude-plugins-official
aix remove marketplace claude-plugins-official
```

Like the other `aix add` and `aix remove` commands, these act on your user-scope editor config
by default and leave `ai.json` unchanged. Pass `--save` to write the change to `ai.json` and
`--project` to work at project scope.

## Native support and compatibility unpacking

### Editors with a plugin system

Cursor, GitHub Copilot, Claude Code, and OpenCode load plugins themselves. aix writes the
plugin entries into the editor's configuration and the editor does the rest. Marketplaces are
written for Cursor, GitHub Copilot, and Claude Code.

Cursor has no user-scope plugin configuration, so a user-scope install skips its plugins and
marketplaces with a warning. Use `--project` for Cursor.

Claude Code lets a marketplace source pin a branch, tag, or commit with
`source: { "git": "...", "ref": "..." }`. A full commit ID requires Claude Code
2.1.325 or later. aix preserves the ref when importing the marketplace.

### Antigravity personal plugins

For a local Antigravity plugin, set `editor.antigravity.native` and install at user
scope. The name in the local plugin manifest must match the plugin key.

```json
{
   "plugins": {
      "custom-tools": {
         "source": "./plugins/custom-tools",
         "editor": { "antigravity": { "native": true } }
      }
   }
}
```

aix registers the existing directory in `~/.gemini/config/plugins.json`.
Antigravity loads the bundle in place, so hooks retain access to files alongside
their manifest. Removing the registration leaves the bundle on disk. Project
installs continue to use compatibility unpacking.

### Compatibility unpacking

aix expands local plugins for Windsurf, Zed, Codex, Antigravity projects, and Grok CLI.
It installs the parts it finds as ordinary skills, rules, and MCP servers:

- **Skills** from `<plugin>/skills/*/SKILL.md`, or a single `<plugin>/SKILL.md`.
- **Rules** from `<plugin>/rules/*.md` and `*.mdc`.
- **MCP servers** from `<plugin>/.mcp.json` or `<plugin>/mcp.json`.

Unpacking has two limits:

- It only applies to plugins whose source is a local directory, such as
  `"./plugins/custom-tools"`. A plugin named only by a marketplace entry is not downloaded and
  unpacked.
- It only runs in a project-scope install (`aix install --project`).

The [support matrix](/editors/supported-editors/) shows plugin and marketplace support for
every editor, and each editor page lists the file aix writes.

## Name collisions with plugin contents

Your `ai.json` may define a skill, rule, MCP server, or hook that a plugin also provides.

### In editors with a plugin system

The editor decides, because it loads the plugin itself. In Claude Code:

- **Skills**: a skill you configured takes precedence over a plugin skill with the same name.
- **Hooks**: hooks from your config and hooks from enabled plugins both run on a matching
  event.
- **MCP servers**: servers from your config run alongside servers started by enabled plugins.

### In compatibility installs

aix prefixes every unpacked item with the plugin name. A plugin `skill-creator` that contains
a skill `eval-viewer` and a rule `guidelines.md` is unpacked as `skill-creator-eval-viewer`
and `skill-creator-guidelines`. Items you define yourself have no prefix, so the names do not
normally collide.

If you do define an item with the same prefixed name, such as a skill called
`skill-creator-eval-viewer`, your definition in `ai.json` is used and the unpacked one is
dropped.
