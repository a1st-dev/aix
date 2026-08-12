# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

### Fixed

- Keep MCP auth headers when syncing a remote server between editors
- Import remote MCP servers from Zed, which were skipped entirely
- Write Gemini remote servers to `httpUrl`, its streamable HTTP key, and import
  servers declared with either `httpUrl` or `url`
- Map Codex remote auth to `http_headers`, `env_http_headers`, and
  `bearer_token_env_var` instead of dropping it
- Keep a disabled server in the Codex and Windsurf configs, marked disabled,
  rather than removing it from the file

## [0.6.0] - 2026-08-12

### Added

- Discover opencode skills from the Claude and agents directories

### Fixed

- Allow `safeRm` in the user-scope Copilot, Gemini, and opencode directories
- Serialize concurrent skill directory replacements
- Replace managed skills transactionally
- Find nested `SKILL.md` files in git skill repos
- Apply source configurations consistently
- Apply the July 2026 editor research follow-ups
- Isolate user-scope installs when adding sources
- Accept `devin` as a Windsurf editor alias
- Strip frontmatter from Windsurf global rules
- Parse flexible skill frontmatter

## [0.5.1] - 2026-05-27

### Added

- Update the Zed adapter for v1.4.2 native Agent Skills

### Fixed

- Use `upsertManagedSection` for user-scope rules in the base and Zed adapters
- Do not write `.rules` at the project root on a Zed `--user` install

## [0.5.0] - 2026-05-27

### Added

- Add Codex hooks support

### Fixed

- Convert Zed prompts to skills and preserve `settings.json` on merge

## [0.4.1] - 2026-05-19

### Fixed

- Sync targeted MCP removals

## [0.4.0] - 2026-05-17

### Added

- Add support for direct global installs

### Fixed

- Use the Copilot config path on Windows

## [0.3.1] - 2026-05-14

### Fixed

- Do not inline frontmatter in the rules adapter
- Install Claude user rules as imports
- List all editors when `--all` is passed

## [0.3.0] - 2026-05-09

### Added

- Add agent support

## [0.2.0] - 2026-05-08

### Added

- Audit and update hook names for all editors
- Convert prompts to skills for Copilot user scope

### Changed

- Move import into editor strategies
- Update dependencies to the latest

### Fixed

- Use correct Claude Code MCP server config path

## [0.1.0] - 2026-04-26

- Initial release
