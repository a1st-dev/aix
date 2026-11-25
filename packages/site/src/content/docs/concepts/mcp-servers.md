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

`aix install` writes each editor's user-scope MCP config by default, for example
`~/.claude.json` for Claude Code. With `--project`, it writes the editor's project MCP file
instead, for example `.mcp.json`.

Windsurf and Codex are exceptions. aix has no project MCP file to write for them, so their
servers always go to the user-scope file (`~/.codeium/windsurf/mcp_config.json` and
`~/.codex/config.toml`), even in a `--project` install. The install output lists these writes
separately. aix skips them when it detects a CI environment, and `aix sync --scope project`
skips them and reports the skip.

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

## Finding servers

Use `aix search` to browse the official MCP Registry:

```bash
aix search --type mcp
```

The search is interactive and needs an `ai.json` in the project, so run `aix init` first.
Selecting a server saves it to `ai.json`. Run `aix install` afterwards to write it to your
editors.

To add a server without the search UI, use `aix add mcp`. On its own it installs the server
into your user-scope editor config and leaves `ai.json` unchanged. With `--save` it writes the
server to `ai.json`:

```bash
# Install into your editors only
aix add mcp playwright --command "npx @playwright/mcp@latest"

# Save to ai.json, then install from it
aix add mcp playwright --command "npx @playwright/mcp@latest" --save --no-install
aix install
```

## Install one server without ai.json

`aix install --type mcp` installs a single server into one editor:

```bash
aix install playwright --type mcp --target claude-code --user
aix install https://example.com/mcp --type mcp --name docs --target claude-code --user
```
