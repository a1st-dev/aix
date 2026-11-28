# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
   Do NOT run `bd dolt push`. Beads has no dolt remote, on purpose. Pushing the beads
   database into this repo writes a `__dolt_remote_info__` branch and a `refs/dolt/data`
   ref, and Vercel then tries to deploy a tree with no `package.json`, so every such
   deployment fails. Beads data stays local.
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

 <!-- END BEADS INTEGRATION -->

## Build & Test

```bash
npm install            # Install dependencies for every workspace
npm run build:lib      # Build the schema, core, mcp-registry-client, and cli packages
npm run standards      # Lint, check formatting, and typecheck
npm test               # Build what each package depends on, then run every package's tests
```

Run the tests of one package, or one test file in it:

```bash
npm test --workspace @a1st/aix-core
npm test --workspace @a1st/aix-core -- src/__tests__/<file>
```

Tests must go through these scripts. Each package's `test` script runs Vitest through
`scripts/test-runner.mjs`, which gives the run a temporary home directory and, on macOS, an
OS sandbox that denies writes outside it. The runner refuses to start anywhere else except a
GitHub-hosted CI runner. On Linux, `AIX_TEST_DISPOSABLE=1` starts it with the temporary home
directory and no sandbox; set it only inside a container or another throwaway machine, never
on a workstation that has editor config. Do not run Vitest directly.

## Manual testing

Manual testing must never write to the real user config. `aix` resolves the home directory from
`$AIX_USER_HOME` first, then `$HOME`, then `%USERPROFILE%`, and only then falls back to
`os.homedir()`. Point both `AIX_USER_HOME` and `HOME` at a throwaway directory to isolate a run:

```bash
SANDBOX_HOME="$(mktemp -d)"
AIX_USER_HOME="$SANDBOX_HOME" HOME="$SANDBOX_HOME" node packages/cli/bin/aixd.mjs install
```

- `AIX_USER_HOME` redirects every user-scope path aix reads or writes. `HOME` also keeps the
  CLI's own cache and the git and npm processes aix spawns out of the real home
- `--user-home <dir>` is the per-command form of `AIX_USER_HOME`. Each command prints the
  directory it is using, so check for that line before trusting a run
- Do this for anything that can touch global config: `~/.claude.json`, `~/.claude/settings.json`,
  `~/.gemini/settings.json`, `~/.config/zed/settings.json`, `~/.config/github-copilot/`,
  `~/.codeium/windsurf/mcp_config.json`, `~/.codex/config.toml`, and the `~/.aix/backups/`
  store, where aix copies every file before it changes or deletes it
- User scope is the default for `install`, `add`, `remove`, and `sync`. Running them from this
  repository without the override installs the root `ai.json` into the real editor config
- `npm run qa:sandbox` gives you a scratch project and sets `AIX_USER_HOME`, `HOME`,
  `USERPROFILE`, and XDG directories to its temporary home, including for the generated `aix`
  wrapper
- Automated tests must run through the package `test` or `test:watch` scripts, which use
  `scripts/test-runner.mjs`; do not run Vitest directly and do not add per-suite home isolation
- Write to the real user config only when explicitly asked to

## Architecture Overview

An npm workspace with five packages, built with turbo:

- `packages/schema` (`@a1st/aix-schema`): the Zod schemas for `ai.json`, `ai.local.json`, and
  `ai.lock.json`, the list of editor names, and the editor support data that the docs site
  renders. `schema.json` is generated from the Zod schemas by `npm run generate-schema` in that
  package
- `packages/core` (`@a1st/aix-core`): everything that reads config and writes editor files
- `packages/cli` (`@a1st/aix`): the oclif CLI. `bin/aixd.mjs` runs the TypeScript source and
  `dist/cli.js` is the built CLI that the tests run
- `packages/mcp-registry-client`: a client for the official MCP Registry API
- `packages/site`: the Astro and Starlight docs site, deployed by Vercel

An install moves through core in this order:

1. `discovery.ts` finds `ai.json`, and `loader.ts` loads it: `inheritance.ts` resolves
   `extends`, the local overrides in `ai.local.json` are merged, and `lockfile.ts` checks
   `ai.lock.json`
2. `editors/install.ts` asks each editor's adapter in `editors/adapters/` for a list of
   `FileChange` objects. An adapter delegates each section (rules, MCP, skills, prompts, hooks,
   agents, plugins) to a strategy in `editors/strategies/<editor>/`
3. `editors/apply-file-changes.ts` writes the changes. It backs up each file with `backup.ts`,
   replaces it atomically with `fs/replace-file.ts`, and restores every file if one write fails
4. `editors/install-receipts.ts` and `state/tracker.ts` record what was installed, so a later
   install or remove deletes only what aix created

`editors/import.ts` reads config out of an editor for `aix init --from`, `aix list`, and
`aix sync`. `editors/remove.ts` removes one item and uses the same importer to find it.

## Conventions & Patterns

- Core reaches the file system, the environment, and the home directory only through
  `getRuntimeAdapter()` in `packages/core/src/runtime/`. Do not call `os.homedir()` or read
  `process.env.HOME` anywhere else: the adapter is what makes `AIX_USER_HOME` and the test
  sandbox work
- A change to an editor file is a `FileChange` applied by `applyFileChanges`. Do not write
  editor files with `writeFile`. Anything else that overwrites or deletes a user's file calls
  `createBackup` first and writes with `replaceFile`
- Delete with `safeRm`, which refuses paths outside `.aix` and the editor config directories
- Change JSON, JSONC, and TOML files by patching the existing text, so comments and unrelated
  keys stay: `applyJsoncDiff` from the schema package for `ai.json`, `planJsonFileChange` in
  `editors/adapters/base.ts` for editor JSON, and `updateToml` in `toml.ts` for TOML
- Every CLI command extends `BaseCommand`. Reuse the flag definitions in
  `packages/cli/src/flags/`, and resolve the scope with `resolveTargetScope` so every command
  gives the same answer for the same project
- A command that works through several editors reports each failure and calls `markFailed()`
  so the process exits non-zero
- Editor names come from `editorNames` in `packages/schema/src/editors.ts`. Do not keep a
  second list
- A change that a user can see gets an entry under `## [Unreleased]` in the changed package's
  `CHANGELOG.md`, and an update to the page in `packages/site/src/content/docs/` that describes
  the behavior
