# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

### Added

- Add the `--user-home <dir>` flag and `AIX_USER_HOME` environment variable, which move
  user-scope editor config and aix's `~/.aix/` state to another directory
- Add `aix backups restore <backup file>`, which copies a backup back over the file it was
  taken from and backs up what it replaces
- Declare the MIT license in `package.json`

### Changed

- List every backup from one store in `aix backups`, whatever directory it runs from;
  `--json` entries are now `{ path, originalPath, backupDate, size }`
- Print the scope an install targets before it writes, and the path of every file it
  changes, so a line that touches the home directory is recognizable in `--dry-run` output
- Leave global-only editor config, such as Windsurf and Codex MCP servers, untouched in a
  project-scope `aix install` and report it as skipped
- Use only the arrow keys to move and Enter to install in `aix search`. `j`, `k`, and
  Space also typed into the query, so a two-word search triggered an install

### Fixed

- Resolve the home directory in `aix backups` and `aix remove skill|rule|prompt|agent` the
  same way as every other command; they ignored `HOME` on Windows
- Stop `aix install --overwrite` from replacing whole editor config files such as
  `~/.claude.json`; the flag now only affects the `ai.json` that `--save` writes, and is
  rejected without `--save`
- Stop `aix remove skill`, `rule`, `prompt`, and `agent` from deleting whole directories
  when given a path-like name such as `..`; they now delete only files the editor's own
  importer reports for that item
- Find the right files when removing Copilot, Zed, Windsurf, and Antigravity rules,
  prompts, and skills, which used a path table that disagreed with where aix installs them
- Keep the shared `.aix/skills/<name>` copy and the state entry when a skill is removed
  from only some editors
- Fail with a pointer to `--yes` when a remove command needs confirmation and there is no
  interactive terminal
- Stop `aix add` without `--save` from removing what an earlier `aix add` or `aix install`
  from the same directory installed
- Limit `aix install --clean` to the regenerable cache in `.aix/.tmp`; it used to delete
  the whole `.aix` directory, including `~/.aix/ai.json`, other projects' skills, and
  imported files, after the new skills were already installed
- Stop `aix cache clear` and `aix install --clean` from deleting backups
- Honor the `scope` an `ai.json` declares in `aix install`; a config that declared project
  scope was installed into user-level editor config unless `--project` was passed
- Exit non-zero when `aix install`, `aix sync`, or an `aix remove` command fails for any
  editor; they printed the failure and exited 0
- Say so when `aix add` finds no editor to install to, and detect editors for
  `aix add --save` when `ai.json` lists none; both used to install nowhere without a word
- Name the detected editors and point at `--target` when `aix install` would have to ask
  which editors to use and there is no terminal; the same for the registry server choice
  in `aix add mcp`
- Print one JSON document from `aix validate --json` when no config is found; it printed
  two
- Sync a source editor whose only config is agents; `aix sync` reported that nothing was
  found
- Describe `--lock` and `--scope` correctly on remove commands, and stop claiming
  `--target` is case-insensitive
- Stop installing Astro, Starlight, and the Vercel adapter with the CLI; they were listed
  as runtime dependencies and never imported. Declare `pathe` and `p-map`, which the CLI
  imports
- Install the MCP server that is highlighted in `aix search`; it searched again by short
  name and installed the first match
- Report an install from `aix search` as failed when no editor received the item

## [0.6.0] - 2026-08-12

### Added

- Add the `live source` command
- Discover opencode skills from the Claude and agents directories

### Changed

- Upgrade `@oclif/plugin-update` to 4.7.57

### Fixed

- List user-scope items by scanning editor configs
- Apply source configurations consistently
- Isolate user-scope installs when adding sources
- Track state for every installed section when adding sources
- Use editor discovery when `-e` is passed without `--all`
- Apply the `--editor` filter to state-based `ls` output
- Accept `devin` as a Windsurf editor alias
- Support adding several sources in one command

## [0.5.1] - 2026-05-27

- No changes

## [0.5.0] - 2026-05-27

- No user-facing changes

## [0.4.1] - 2026-05-19

### Fixed

- Sync targeted MCP removals

## [0.4.0] - 2026-05-17

### Added

- Add support for direct global installs

## [0.3.1] - 2026-05-14

### Fixed

- List all editors when `--all` is passed

## [0.3.0] - 2026-05-09

### Added

- Add agent support

## [0.2.0] - 2026-05-08

### Added

- Audit and update hook names for all editors

### Changed

- Move import into editor strategies
- Update dependencies to the latest

### Fixed

- Use correct Claude Code MCP server config path

## [0.1.0] - 2026-04-26

- Initial release
