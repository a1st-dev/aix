---
sidebar:
   order: 6
title: Plugins & Marketplaces
description: Manage AI editor plugins, marketplaces, and compatibility unpacking across editors.
---

Plugins extend AI agents with bundled tools, skills, rules, hooks, and MCP servers. Marketplaces provide registries or collections where plugins can be discovered and installed.

`aix` provides first-class configuration for plugins and marketplaces via `ai.json`, configuring native plugin registries where supported and automatically converting and unpacking plugin components for editors without native plugin systems.

---

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
         "source": "https://github.com/my-org/marketplace",
         "type": "git"
      }
   }
}
```

### CLI Commands

```bash
# Add a marketplace
aix add marketplace https://github.com/anthropics/claude-plugins-official --name claude-plugins-official

# Add a plugin from a marketplace or local path
aix add plugin skill-creator@claude-plugins-official
aix add plugin ./plugins/custom-tools --name custom-tools

# List configured plugins and marketplaces
aix list plugins
aix list marketplaces

# Remove a plugin or marketplace
aix remove plugin skill-creator@claude-plugins-official
aix remove marketplace claude-plugins-official
```

---

## Native Support vs Compatibility Unpacking

Different editors have different levels of support for plugins and marketplaces:

1. **Native Plugin Editors** (`claude-code`, `opencode`, `copilot`, `cursor`):
   - **Claude Code**: Writes enabled plugins to `enabledPlugins` and marketplaces to `extraKnownMarketplaces` in `.claude/settings.json` (project) or `~/.claude/settings.json` (user).
   - **OpenCode**: Writes plugin references or paths to the `plugins` array in `opencode.json` (project) or `~/.config/opencode/opencode.json` (user).
   - **Copilot**: Writes `.github/copilot-plugins.json` and `.github/copilot-marketplaces.json` (project) or `~/.config/github-copilot/` (user).
   - **Cursor**: Writes `.cursor-plugin/plugin.json` and `.cursor-plugin/marketplaces.json` at project scope. (Cursor has no user-scope plugin configuration).

2. **Compatibility Unpacking for Non-Native Editors** (`codex`, `windsurf`, `zed`, `antigravity`, `grok`):
   - Editors without a native plugin engine cannot load Claude/OpenCode plugin bundles directly.
   - For local or resolved plugin directories, `aix` automatically discovers bundled components:
      - **Skills**: Discovered from `<pluginDir>/skills/*/SKILL.md` or `<pluginDir>/SKILL.md`.
      - **Rules**: Discovered from `<pluginDir>/rules/*.md` or `*.mdc`.
      - **MCP Servers**: Discovered from `<pluginDir>/.mcp.json` or `<pluginDir>/mcp.json`.
   - These components are unpacked and installed directly into the target editor's native directories (e.g. `.agents/skills/`, `.windsurf/rules/`, etc.).

---

## What Happens When a Skill, Rule, or Hook Collides with a Plugin?

If your `ai.json` defines a skill, rule, MCP server, or hook that is also provided by an active plugin, behavior is governed by strict precedence and namespacing:

### 1. In Editors with Native Plugin Support

- **Skills**: Native editors like Claude Code resolve local project-level skills first. When a local skill in `.claude/skills/<name>` shares a name with a skill bundled inside an enabled plugin, the local project skill takes precedence.
- **Hooks**: Both user-defined hooks and plugin hooks execute. In Claude Code, hooks registered in `.claude/settings.json` and hooks provided by active plugins both trigger on matching lifecycle events, running sequentially.
- **MCP Servers**: Servers explicitly declared in `mcp` (`.mcp.json`) run alongside any servers spun up by enabled plugins.

### 2. In Non-Native Editors via Compatibility Unpacking

When `aix` unpacks a plugin for non-native editors, it employs two layers of conflict protection:

1. **Automatic Namespace Prefixing**:
   - Every unpacked component is automatically namespaced using the plugin's name: `${pluginName}-${componentName}`.
   - For example, if plugin `skill-creator` contains a skill named `eval-viewer` and a rule `guidelines.md`, `aix` unpacks them as `skill-creator-eval-viewer` and `skill-creator-guidelines`.
   - Because user-defined skills and rules in `ai.json` are authored without the plugin prefix (e.g. `eval-viewer`), **their keys do not collide**.

2. **Explicit User Config Always Overrides (`...unpacked, ...userConfig`)**:
   - If a collision occurs (for instance, if you explicitly define a skill or rule named `skill-creator-eval-viewer` in your `ai.json`), `aix` merges unpacked components _underneath_ your configuration:
      ```ts
      skills: { ...unpacked.skills, ...config.skills },
      mcp: { ...unpacked.mcp, ...config.mcp },
      rules: { ...unpacked.rules, ...config.rules },
      ```
   - **Your explicit `ai.json` definitions always override plugin-provided components.**
