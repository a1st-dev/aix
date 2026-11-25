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

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

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

_Add a brief overview of your project architecture_

## Conventions & Patterns

_Add your project-specific conventions here_
