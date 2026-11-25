# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

### Added

- Add the `AIX_USER_HOME` environment variable (exported as `USER_HOME_ENV_VAR`), which the
  Node runtime adapter's `os.homedir()` returns ahead of `HOME` and `USERPROFILE`
- Add `findNativeItemPath`, which locates the native file for a named skill, rule, prompt,
  or agent through the editor's importer
- Add `listAllBackups`, `pruneBackups`, and `getBackupStoreDir`; `restoreBackup` can now
  find the original path itself and backs up the file it replaces

### Changed

- Change `trackRemoval` to take an options object; with `editors` it removes only those
  editors from the state entry
- Keep every backup in one store at `~/.aix/backups`, keyed by the original file's path;
  backups were written to a `.aix/.tmp/backups` directory beside each edited file,
  including inside editor config directories
- Require the parsed input as the second argument of `toConfigValidationError`

### Removed

- Remove the `overwrite` apply option, which replaced whole editor config files rather
  than merging into them
- Remove the `clean` apply option; clear the cache with `clearCache` before loading a
  config
- Remove `getBackupsDir` and the `backups` category of `getCacheStatus`; backups are no
  longer cache content
- Remove the unused `hasUnresolvedEnvVars` and `hasUnresolvedVariables` exports, and
  `ResolveOptions.visited`

### Fixed

- Keep MCP auth headers when syncing a remote server between editors
- Import remote MCP servers from Zed, which were skipped entirely
- Write Gemini remote servers to `httpUrl`, its streamable HTTP key, and import
  servers declared with either `httpUrl` or `url`
- Map Codex remote auth to `http_headers`, `env_http_headers`, and
  `bearer_token_env_var` instead of dropping it
- Keep a disabled server in the Codex and Windsurf configs, marked disabled,
  rather than removing it from the file
- Keep top-level settings that hold a `command` or `url`, such as Claude Code's
  `statusLine`, in place when merging hooks, plugins, or marketplaces into a JSON config
- Refuse to install into a Grok `config.toml` that cannot be parsed rather than replacing
  it
- Refuse to delete an editor config directory or a `.aix` directory itself in `safeRm`,
  and stop treating any directory named `opencode` or `github-copilot` as editor config
- Match the Windows system-directory blocklist in `safeRm`, which compared backslash paths
  against forward-slash ones
- Refuse to install a skill over an existing editor skill directory that aix did not
  create; it used to delete the directory and replace it with a link
- Back up an editor config file before `removeMcpFromEditor`, `removeHookFromEditor`,
  `removePluginFromEditor`, or `removeMarketplaceFromEditor` rewrites it
- Stop importing path-scoped Claude Code rules from `~/.claude/CLAUDE.md`; the import
  loaded every rule in every session, so a rule's `paths` had no effect
- Key git caches and download directories by a hash of the full URL, ref, and path; every
  GitHub skill shared one cache directory, and a rule's cache ignored its ref and path
- Allow extended configs to share a base config without reporting a circular dependency
- Rebase object-form rule, prompt, agent, and skill paths from extended configs
- Detect changed agents when checking `ai.lock.json`
- Copy string-form skills and same-named rule files when saving a remote config with
  `--copy`; name imported files after their config key
- Merge a new import into `.aix/imported` instead of replacing earlier imports
- Show the received value in `ai.json` validation errors
- Parse frontmatter with CRLF line endings, a byte order mark, or no trailing newline
- Time out stalled remote config and `extends` downloads
- Install git `extends` dependencies with npm and without lifecycle scripts, and only when
  their manifests change
- Keep the existing `.aix/extends` copy when a download or install fails
- Change only the updated entries when writing `ai.json` and `ai.local.json`; unknown keys
  were deleted and empty sections added
- Report circular `extends`, failed downloads, and syntax errors in extended configs with
  their own error type and file
- Install versioned npm sources into `.aix/.tmp` instead of the project's `node_modules`
- Let an explicit `"activation": "always"` override rule frontmatter
- Keep the ref when normalizing a GitHub tree URL for `--extends`
- Accept a single-server `mcpServers` file without `--name`
- Apply `ai.local.json` when the config path is given explicitly
- Write a new global-only MCP server when the same file already holds one from an earlier
  install; it was reported as installed and never written
- Replace a Codex, Grok, or OpenCode MCP server whose definition changed rather than
  merging the old and new fields into one entry

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
