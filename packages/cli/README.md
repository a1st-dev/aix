# @a1st/aix

**The main CLI for aix** — unified AI agent configuration across editors.

This is the primary package for the `aix` project. It provides the `aix` command-line tool
for managing `ai.json` configuration files.

## Installation

```bash
npm install -g @a1st/aix
```

## Usage

```bash
aix init                              # Create ai.json
aix search                            # Search for MCP servers and skills
aix install github:org/config         # Install remote config
aix add skill <source>                # Add a skill
aix add mcp <name>                    # Add MCP server from registry
aix list skills                       # List configured skills
```

## Documentation

See the [main project README](https://github.com/a1st-dev/aix/blob/main/README.md) for full documentation.

## Related Packages

- [`@a1st/aix-core`](https://github.com/a1st-dev/aix/blob/main/packages/core/README.md) — Config loading, editor adapters, and skill resolution
- [`@a1st/aix-schema`](https://github.com/a1st-dev/aix/blob/main/packages/schema/README.md) — Zod schemas and JSON Schema for `ai.json`
- [`@a1st/mcp-registry-client`](https://github.com/a1st-dev/aix/blob/main/packages/mcp-registry-client/README.md) — MCP Registry API client

## License

MIT
