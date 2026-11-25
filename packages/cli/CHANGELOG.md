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

### Changed

- List every backup from one store in `aix backups`, whatever directory it runs from;
  `--json` entries are now `{ path, originalPath, backupDate, size }`

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
