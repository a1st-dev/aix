# @a1st/aix

**The main CLI for aix**. It keeps AI editor config in one place and can also sync
supported config between editors.

This is the primary package for the `aix` project. It provides the `aix` command-line tool
for managing `ai.json` configuration files.

## Installation

```bash
npm install -g @a1st/aix
```

## Usage

```bash
aix init                              # Create ai.json
aix init --from cursor                # Bootstrap ai.json from an editor
aix sync cursor --to claude-code      # Sync supported config editor -> editor
aix search <query>                    # Search for MCP servers and skills
aix install github:org/config         # Install remote config
aix install playwright --type mcp --target claude-code --user # Direct install
aix add skill <source>                # Add a skill
aix add mcp <name>                    # Add MCP server from registry
aix add agent <source>                # Add an agent from markdown file
aix list [--scope user|project]       # List skills, mcp, rules, prompts, agents, hooks, or editors
```

Use `aix install` to apply `ai.json` to editors. Use `aix sync` when the source of truth is
another editor and you want aix to bridge the formats for you.

## Local development

From the repository root, install dependencies and link the development command once:

```bash
npm install
npm run link:dev
aixd <command>
```

`aixd` runs the CLI and workspace dependencies directly from this checkout's TypeScript
source. It works from any directory and picks up edits on the next run. No build or watch
process is required.

The link uses npm's global prefix. If you move the checkout or want to use another one,
run `npm run link:dev` from that checkout. If you need the compiled `aix` command, run
`npm run build:lib` and then `npm run link:dev`.

## Documentation

See the [main project README](https://github.com/a1st-dev/aix/blob/main/README.md) for full documentation.

## Related Packages

- [`@a1st/aix-core`](https://github.com/a1st-dev/aix/blob/main/packages/core/README.md) — Config loading, editor adapters, and skill resolution
- [`@a1st/aix-schema`](https://github.com/a1st-dev/aix/blob/main/packages/schema/README.md) — Zod schemas and JSON Schema for `ai.json`
- [`@a1st/mcp-registry-client`](https://github.com/a1st-dev/aix/blob/main/packages/mcp-registry-client/README.md) — MCP Registry API client

## License

MIT
