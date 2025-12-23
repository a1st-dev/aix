# aix

[![CI](https://github.com/a1st/aix/actions/workflows/test.yml/badge.svg)](https://github.com/a1st/aix/actions/workflows/test.yml)
[![npm version](https://badge.fury.io/js/@a1st%2Faix.svg)](https://www.npmjs.com/package/@a1st/aix)

**One config file. Every AI editor.**

`aix` is like NPM + package.json for your AI agent editor configuration.

Define your AI agent configuration once in `ai.json`. Share it with your team. Check it
into version control. Install it instantly with `aix install`.

Install to any supported editor with `aix install`.

## Why aix?

- **Stop duplicating config** — Define skills, MCP servers, and rules once instead of per-editor
- **Share team standards** — Extend configs from GitHub, GitLab, npm, or local files
- **Install configs instantly** — `aix install github:company/ai-config` pulls and merges remote configs
- **Safe updates** — Atomic writes with automatic backup and rollback

## Quick Start

```bash
npm install -g @a1st/aix

# Initialize a blank ai.json file for your project
aix init

# Optionally, initialize it using your global editor settings:
aix init --from <editor>
```

## Examples

Once you have an `ai.json` file, you can add MCP servers and skills to it.

```bash
# Add an MCP server from the official registry
aix add mcp playwright

# Add a skill. Works with GitHub URLs, local paths, and npm packages.
aix add skill https://github.com/obra/superpowers/blob/main/skills/systematic-debugging

# Or install from a shared config
aix install github:your-org/shared-ai-config
```

## Features

| Feature                | Description                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Config Inheritance** | Extend from local files, git repos, or npm packages                                                   |
| **Skills System**      | Reusable AI behaviors from the Agent Skills ecosystem                                                 |
| **MCP Servers**        | Declarative MCP config with [official registry](https://registry.modelcontextprotocol.io) integration |
| **Smart Rules**        | Global, project, and path-specific rules with activation modes                                        |
| **Editor Sync**        | Auto-generate editor-native configs from `ai.json`                                                    |
| **Remote Install**     | Pull configs from GitHub/GitLab/Bitbucket with `aix install`                                          |
| **Atomic Updates**     | Safe config modifications with automatic backup                                                       |
| **Cache Management**   | Automatic cleanup of stale cache entries                                                              |
| **Type Safety**        | Zod validation + JSON Schema for IDE autocomplete                                                     |

## Installation

```bash
# CLI (recommended)
npm install -g @a1st/aix

# Programmatic usage
npm install @a1st/aix-core @a1st/aix-schema
```

## CLI Commands

```bash
aix init                              # Create ai.json
aix install github:org/config         # Install remote config
aix install --save --scope mcp        # Merge specific sections
aix add skill https://github.com/obra/superpowers/tree/main/skills/systematic-debugging              # Add a skill
aix add mcp playwright                # Add MCP server from registry
aix add mcp github --command "npx @modelcontextprotocol/server-github"  # Manual config
aix list skills                       # List configured skills
aix cache clear                       # Clear cache and backups
```

## Documentation

- [Developer Guide](./DEVELOPERS.md) — Contributing, architecture, testing
- [Specifications](./specs/) — Detailed design documents

## License

MIT
