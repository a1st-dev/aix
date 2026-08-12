# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

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
