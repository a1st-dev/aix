---
sidebar:
   order: 40
title: MCP servers
description: Extend your AI with Model Context Protocol servers.
---

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that enables AI models to interact with external tools and data sources.

aix provides first-class support for configuring MCP servers and syncing that configuration to any editor that supports MCP (Cursor, GitHub Copilot, Claude Code, Windsurf, Zed, Codex, Antigravity, OpenCode, Grok CLI).

## Configuring servers

Define servers in the `mcp` object in `ai.json`. There are two ways to connect to an MCP server:

### Stdio (local process)

Run a local command (like `npx` or a python script) that speaks MCP over standard input/output.

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

You can restrict which tools and resources an MCP server exposes to the AI.

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

## Global vs. Project Config

Some editors (Windsurf and Codex in aix's current adapter) use global MCP configuration, while others (Cursor, GitHub Copilot, Claude Code, Zed, Antigravity, OpenCode, Grok CLI) support project-specific config.

aix handles this complexity for you:

- For project-specific editors, it writes to the project config.
- For global-only editors, it **merges** your project's MCP config into the global config and tracks which project added which server.
- When you remove a server or delete the project, aix automatically cleans up the global config using its state tracking system.

## Finding servers

Use `aix search` to browse the official MCP Registry:

```bash
aix search --type mcp
```

The search is interactive and needs an `ai.json` in the project, so run `aix init` first.
Selecting a server saves it to `ai.json` and installs it.

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

You can also install one MCP server without creating `ai.json`:

```bash
aix install playwright --type mcp --target claude-code --user
aix install https://example.com/mcp --type mcp --name docs --target claude-code --user
```
