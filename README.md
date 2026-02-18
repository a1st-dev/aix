# aix

[![CI](https://github.com/a1st-dev/aix/actions/workflows/test.yml/badge.svg)](https://github.com/a1st-dev/aix/actions/workflows/test.yml)
[![npm version](https://badge.fury.io/js/@a1st%2Faix.svg)](https://www.npmjs.com/package/@a1st/aix)

**One config file. Every AI editor.**

`aix` is like NPM + package.json for your AI agent editor configuration.

```bash
# Create a local ai.json file for storing your config
aix init
# Add config for an MCP server from the official registry
aix add mcp playwright
# Add a skill from GitHub, local path, or npm package
aix add skill https://github.com/obra/superpowers/blob/main/skills/systematic-debugging
# Add a rule from GitHub, local path, or npm package
aix add rule ../rules/typescript-rules.md
# Add a prompt (also known as a workflow or slash command)
aix add prompt ../prompts/typescript-prompts.md
# Install all of the above to any supported editor. Outputs workspace-specific config
aix install --target claude-code --target cursor
```

Supported editors:

- `claude-code`
- `cursor`
- `copilot`
- `windsurf`
- `codex`
- `zed`

## Why aix?

Define your AI agent configuration once in `ai.json`.

`aix` gives you one source of truth for your skills, prompts, rules, MCP server config.
Then, use that config with any supported agent/editor: claude-code, cursor, copilot, etc.

Standardize your AI config. Share it with your team. Check it into version control.

- **Discover new MCP servers and skills** - Use `aix search` to find and add new MCP servers and skills
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

## CLI Commands

```bash
aix init                              # Create ai.json
aix search                            # Search for MCP servers and skills
aix install github:org/config         # Install remote config
aix install --save --scope mcp        # Merge specific sections
aix add skill https://github.com/obra/superpowers/tree/main/skills/systematic-debugging # Add a skill
aix add mcp playwright                # Add MCP server from registry
aix add mcp github --command "npx @modelcontextprotocol/server-github" # Manual config
aix list skills                       # List configured skills
```

## License

MIT
