---
slug: concepts/mcp-servers
sidebar:
   order: 4
title: MCP Servers
description: Extend your AI with Model Context Protocol servers.
---

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that enables AI models to interact with external tools and data sources.

aix provides first-class support for configuring MCP servers and syncing that configuration to any editor that supports MCP (Cursor, GitHub Copilot, Claude Code, Windsurf, Zed, Codex).

## Configuring Servers

Define servers in the `mcp` object in `ai.json`. There are two ways to connect to an MCP server:

### 1. Stdio (Local Process)

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

### 2. HTTP (Streamable HTTP)

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

## Tool & Resource Filtering

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

Some editors (Windsurf, Zed, Codex) only support a **global** MCP configuration file, while others (Cursor, GitHub Copilot, Claude Code) support project-specific config.

aix handles this complexity for you:

- For project-specific editors, it writes to the project config.
- For global-only editors, it **merges** your project's MCP config into the global config and tracks which project added which server.
- When you remove a server or delete the project, `aix global cleanup` keeps the global config tidy.

## Finding Servers

Use `aix search` to browse the official MCP Registry:

```bash
aix search --type mcp
```

This interactive command lets you find servers (like GitHub, Slack, Postgres, Brave Search) and add them to your `ai.json` with one click.
