---
sidebar:
   order: 40
title: MCP servers
description: Extend your AI with Model Context Protocol servers.
---

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that lets
AI models use external tools and data sources.

You define MCP servers once in `ai.json`, and aix writes them into the MCP config of each
editor you install to. Every [supported editor](/editors/supported-editors/) has MCP support.

## Configuring servers

Define servers in the `mcp` object in `ai.json`. There are two ways to connect to an MCP server:

### Stdio (local process)

Run a local command, such as `npx` or a Python script, that speaks MCP over standard input and
output.

```json
{
   "mcp": {
      "github": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-github"],
         "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
         }
      }
   }
}
```

### HTTP (Streamable HTTP)

Connect to a remote MCP server over HTTP.

```json
{
   "mcp": {
      "brave-search": {
         "url": "http://localhost:3000/mcp"
      }
   }
}
```

## Tool and resource filtering

You can restrict which tools and resources an MCP server exposes to the model.

```json
{
   "mcp": {
      "filesystem": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
         "tools": {
            // Only allow reading files, not writing
            "include": ["read_file", "list_directory"],
            "exclude": ["write_file", "edit_file"]
         }
      }
   }
}
```

## User scope and project scope

At user scope, `aix install` writes each editor's user-scope MCP config, for example
`~/.claude.json` for Claude Code. At project scope, it writes the editor's project MCP file
instead, for example `.mcp.json`. [User scope and project scope](/concepts/scopes/) explains
how the scope is chosen.

Windsurf and Codex are exceptions. aix has no project MCP file to write for them, so their
servers only go to the user-scope file (`~/.codeium/windsurf/mcp_config.json` and
`~/.codex/config.toml`). A project-scope `aix install` leaves those files alone and lists the
servers as skipped, and so does `aix sync --scope project`. A user-scope install writes them
and lists them separately in its output, unless aix detects a CI environment.

Each editor page lists its MCP paths:
[Cursor](/editors/cursor/#cursor-feature-mcp),
[GitHub Copilot](/editors/copilot/#copilot-feature-mcp),
[Claude Code](/editors/claude-code/#claude-code-feature-mcp),
[Windsurf](/editors/windsurf/#windsurf-feature-mcp),
[Zed](/editors/zed/#zed-feature-mcp),
[Codex](/editors/codex/#codex-feature-mcp),
[Google Antigravity](/editors/antigravity/#antigravity-feature-mcp),
[OpenCode](/editors/opencode/#opencode-feature-mcp), and
[Grok CLI](/editors/grok/#grok-feature-mcp).

### OpenCode configuration

aix preserves an existing OpenCode v2 `mcp.servers` layout and can read v1 and v2
server entries in the same file. Add `editor.opencode` to a server in `ai.json` to use
v2 options such as `pool`, `protocol`, `oauth`, or separate `timeout` values for
startup, discovery, and execution. aix preserves shared timeouts in the editor config
and leaves omitted protocol settings to OpenCode.

OpenCode v1 plugin implementations need a port to run on v2. aix can register a plugin
package for either version. Use a package release that supports your OpenCode runtime.

## Finding servers

Use `aix search` to browse the official MCP Registry:

```bash
aix search --type mcp
```

The search is interactive. Installing from it needs an `ai.json` in the project, so run
`aix init` first. Pressing Enter on a server saves it to `ai.json` and installs it to your
editors. See [`aix search`](/cli/search/).

To add a server without the search UI, use `aix add mcp`. On its own it installs the server
into your user-scope editor config and leaves `ai.json` unchanged. With `--save` it writes the
server to `ai.json`:

```bash
# Install into your editors only
aix add mcp playwright --command "npx @playwright/mcp@latest"

# Save to ai.json, then install from it
aix add mcp playwright --command "npx @playwright/mcp@latest" --save --config-only
aix install
```

## Install one server without ai.json

`aix install --type mcp` installs a single server into one editor:

```bash
aix install playwright --type mcp --target claude-code --user
aix install https://example.com/mcp --type mcp --name docs --target claude-code --user
```
