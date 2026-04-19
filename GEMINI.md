# GEMINI.md - aix Project Context

## Project Overview

`aix` is a unified configuration manager for AI agent editors (e.g., Claude Code, Cursor, Copilot, Zed). It provides a single source of truth via an `ai.json` file to manage:

- **MCP Servers:** Model Context Protocol servers for extending agent capabilities.
- **Skills:** Reusable agent behaviors and tools.
- **Rules:** System instructions and coding standards.
- **Prompts:** Workflow definitions and slash commands.

The project is structured as a TypeScript monorepo using npm workspaces.

## Architecture

- **`packages/cli`**: The `oclif`-based CLI tool (`@a1st/aix`). Handles user commands, interactive prompts (using Ink/React), and editor installations.
- **`packages/core`**: Core logic for configuration discovery, loading, inheritance (`extends`), merging, and filesystem operations.
- **`packages/schema`**: Centralized Zod schemas defining the structure of `ai.json` and internal types.
- **`packages/mcp-registry-client`**: Client for fetching metadata from the official MCP registry.
- **`packages/site`**: (TBD) Documentation or landing site.

## Tech Stack

- **Language:** TypeScript (ESM)
- **Frameworks:** `oclif` (CLI), `Ink` (CLI UI), `React`
- **Validation:** `Zod`
- **Testing:** `Vitest`
- **Linting/Formatting:** `oxlint`, `oxfmt`
- **Build Tool:** `tsc` (TypeScript Compiler)

## Key Commands

### Root Development

- `npm run build`: Build all packages in the monorepo.
- `npm run test`: Run all tests across workspaces.
- `npm run standards`: Run lint, format check, and typecheck.
- `npm run lint`: Run `oxlint` for fast linting.
- `npm run format`: Format code using `oxfmt`.
- `npm run typecheck`: Run `tsc --noEmit` to verify types.

### CLI Usage (Internal)

- `npm run dev -w @a1st/aix`: Run the CLI in development mode using `ts-node`.

## Development Conventions

- **ESM First:** All packages use `"type": "module"`.
- **Schema-Driven:** All configuration changes must adhere to the schemas in `packages/schema`.
- **Testing:** New features or bug fixes should include tests in the relevant `__tests__` directory.
- **Fast Linting:** Use `oxlint` for linting. Configuration is in `.oxlintrc.json`.
- **Formatting:** Use `oxfmt`. Configuration is in `.oxfmtrc.json`.
- **Atomic Writes:** Core logic should prioritize atomic file writes with backups (handled by `packages/core`).
- **Releases:** Releases are triggered by pushing a signed git tag (e.g., `git tag -s vX.Y.Z -m "vX.Y.Z"`). Use `npm run version:bump` to update versions across the monorepo before tagging.

## Key Files

- `ai.json`: The primary configuration file for a workspace.
- `package.json`: Monorepo root configuration and shared scripts.
- `packages/schema/src/config.ts`: Defines the main `AiJsonConfig` schema.
- `packages/cli/src/commands/`: Implementation of CLI commands (init, add, install, etc.).
- `packages/core/src/loader.ts`: Logic for loading and merging `ai.json` files.
