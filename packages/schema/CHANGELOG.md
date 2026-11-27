# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

## [0.11.0] - 2026-11-27

### Added

- Add the Claude Code inline skill-shell hook event and native OpenCode v2 MCP options
- Allow an explicit Grok CLI headers helper command for HTTP MCP servers

### Changed

- Require Zod 4 as a peer dependency and use its built-in JSON Schema generator.

## [0.10.1] - 2026-11-26

- No changes

## [0.10.0] - 2026-11-25

### Added

- Declare `sideEffects: false`, so a bundler can drop the exports a caller does not use
- Export `editorNames`, `editorAliasNames`, and `editorInputNames` as the one list of
  editors, which core now reuses
- Declare the MIT license in `package.json`

### Changed

- Stop installing `zod-to-json-schema` with the package; only the build uses it
- Record any scope passed to `createEmptyConfig`, not only `user`

### Removed

- Remove `resolveScope`, whose project default disagreed with what `aix install` does

### Fixed

- Accept the `{ "npm", "path", "version" }` object form for skill and plugin sources
- Describe the `scope` field as the scope `aix install` targets, with user scope as the
  default
- Accept `codex` in the `editors` array shorthand and reject `neovim`, which aix cannot
  install to
- Reject plugin names made only of dots, such as `..`, which resolved to a parent
  directory when the name was used as a skill directory
- Correct the editor support data for Claude Code user-scope rules
  (`~/.claude/rules/*.md`) and for the name of a prompt installed as a skill
- Note Zed's Windows config location in the editor support data

## [0.9.0] - 2026-11-23

- No changes

## [0.8.2] - 2026-11-04

- No changes

## [0.8.0] - 2026-10-01

- Changes to this package were not recorded for this release

## [0.7.0] - 2026-09-08

- Changes to this package were not recorded for this release

## [0.6.0] - 2026-08-12

### Added

- Discover opencode skills from the Claude and agents directories

### Fixed

- Apply the July 2026 editor research follow-ups
- Accept `devin` as a Windsurf editor alias
- Parse flexible skill frontmatter

## [0.5.1] - 2026-05-27

### Added

- Update the Zed adapter for v1.4.2 native Agent Skills

## [0.5.0] - 2026-05-27

### Added

- Add Codex hooks support

## [0.4.1] - 2026-05-19

- No changes

## [0.4.0] - 2026-05-17

- No changes

## [0.3.1] - 2026-05-14

### Fixed

- List all editors when `--all` is passed

## [0.3.0] - 2026-05-09

### Added

- Add agent support

## [0.2.0] - 2026-05-08

### Added

- Audit and update hook names for all editors
- Convert prompts to skills for Copilot user scope

### Changed

- Update dependencies to the latest

### Fixed

- Use correct Claude Code MCP server config path

## [0.1.0] - 2026-04-26

- Initial release
