# aix

[![CI](https://github.com/a1st-dev/aix/actions/workflows/test.yml/badge.svg)](https://github.com/a1st-dev/aix/actions/workflows/test.yml)
[![npm version](https://badge.fury.io/js/@a1st%2Faix.svg)](https://www.npmjs.com/package/@a1st/aix)

**One config file. Every AI editor.**

`aix` is like NPM + package.json for your AI agent editor configuration.

```bash
# Create a local ai.json file for storing your config
aix init
# Optionally create ai.lock.json for reproducible installs
aix init --lock
# Add config for an MCP server from the official registry
aix add mcp playwright
# Add a skill from GitHub, a repo path, a local path, or an installed npm package
aix add skill https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md
# Add a rule from GitHub, local path, or npm package
aix add rule ../rules/typescript-rules.md
# Add a prompt (also known as a workflow or slash command)
aix add prompt ../prompts/review.md
# Install all of the above to any supported editor. Outputs workspace-specific config
aix install --target claude-code --target cursor
# Sync supported config directly from one editor to another
aix sync cursor --to claude-code
```

Supported editors:

- `claude-code`
- `cursor`
- `copilot`
- `windsurf`
- `codex`
- `gemini`
- `opencode`
- `zed`

## Why aix?

Define your AI agent configuration once in `ai.json`.

`aix` gives you one source of truth for your skills, prompts, rules, MCP server config.
Then, use that config with any supported agent/editor: claude-code, cursor, copilot, opencode, etc.

Standardize your AI config. Share it with your team. Check it into version control.

- **Discover new MCP servers and skills** - Use `aix search` to find and add new MCP servers and skills
- **Stop duplicating config** — Define skills, MCP servers, rules, and prompts once instead of per-editor
- **Share team standards** — Extend configs from GitHub, GitLab, npm, or local files
- **Install configs instantly** — `aix install github:company/ai-config` pulls and merges remote configs
- **Move between editors without pairwise converters** — `aix sync` reads one editor into aix's normalized bridge format, then installs what the destination can represent
- **Safe updates** — Atomic writes with automatic backup and rollback
- **Optional lockfiles** — Use `ai.lock.json` when you want aix to detect config drift before installing

## Quick Start

```bash
npm install -g @a1st/aix

# Initialize a blank ai.json file for your project
aix init

# Optionally, initialize it from your existing editor configuration:
aix init --from <editor>

# Or sync supported config directly from one editor to another.
# By default, sync reads user-level config and writes user-level config.
aix sync <from> --to <to>
```

## CLI Commands

```bash
aix init                              # Create ai.json
aix init --lock                       # Create ai.json and ai.lock.json
aix init --extends github:company/cfg # Create with an extends reference
aix sync cursor --to claude-code      # Copy supported config editor -> editor
aix sync cursor --to zed --scope project # Read and write project config
aix search playwright                 # Search for MCP servers and skills
aix install github:org/config         # Install remote config
aix install --lock                    # Refresh ai.lock.json, then install
aix install --save --only mcp         # Merge specific sections
aix add skill ./skills/custom         # Add a skill and install to editors
aix add skill github/awesome-copilot/typescript-mcp-server-generator # Add from a repo path
aix add mcp playwright                # Add MCP server from registry
aix add mcp github --command "npx @modelcontextprotocol/server-github" # Manual config
aix add rule ./rules/typescript.md    # Add a rule from file or URL
aix add prompt ./prompts/review.md    # Add a prompt/command from file or URL
aix remove skill typescript           # Remove a skill and uninstall from editors
aix remove mcp playwright             # Remove an MCP server
aix list skills                       # List configured skills (or mcp, rules, prompts, editors)
aix list --scope user                 # List user-scoped config only
aix list --all --editor copilot       # Show actual editor config, including externally managed items
```

Use `--scope user` / `-u` or `--scope project` / `-p` on `add`, `remove`, `install`, and `list` to target user-level or project-level config.

Use `aix init --from <editor>` when you want to create `ai.json` from an editor. Use
`aix sync <from> --to <to>` when you want to copy supported config between editors without
stopping at `ai.json`.

### Utility Commands

```bash
aix validate                          # Validate ai.json configuration
aix validate --lock                   # Validate and refresh ai.lock.json
aix config show                       # Show current CLI configuration
aix backups                           # List configuration backups
aix cache clear                       # Clear the local cache
```

## Other Notes

### ai.lock.json

`ai.lock.json` is optional. If it exists next to `ai.json`, aix reads it and fails when the
resolved config no longer matches the lockfile. Run `aix validate --lock` or
`aix install --lock` after changing `ai.json`.

The lockfile records SHA-512 integrity strings and SHA-256 digests for resolved config
entities. Those hashes detect drift and tampering in the files aix resolves. They do not
prove who published a remote config or skill.

This project is tested with BrowserStack.

## License

MIT
