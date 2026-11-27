# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

### Added

- Add named installers and removers such as `installSkill` and `removeMcpServer`. Use
  `type` and `config` with `installItem`, and `type` with `removeItem`. Existing calls
  using `section` and `value` still work.
- Allow `detectEditors()` to check for editors without a project path. It now returns
  `{ id, displayName }` objects. Pass the selected IDs to the installer's `editors` option.

- Register local Antigravity bundles at user scope without unpacking the plugin
- Import Antigravity CLI skills from its additional Gemini and shared Agent Skills directories

- Manage native OpenCode v2 MCP servers, including existing JSONC files

- Preserve explicit Grok CLI HTTP MCP header helpers through import and install

- Support fail-closed Claude Code and Grok hooks and the Claude Code inline skill shell event

### Changed

- Require Zod 4 as a peer dependency for library consumers.

### Fixed

- Use the current Copilot CLI user config directory and respect `COPILOT_HOME`, while keeping
  imports and removals from the previous aix directory

- Preserve the ref of pinned Claude Code marketplaces on import and install

## [0.10.1] - 2026-11-26

### Added

- Add `rebuildPackages` to `RuntimeNpmAdapter`, which runs the install scripts of the named
  packages in a directory. A custom runtime adapter must now implement it

### Fixed

- Resolve the relative paths of a config extended by a GitHub blob URL inside that config's
  directory. `resolveExtends` now downloads the directory, as it does for the git form of
  the same address; the paths were read from the extending project before
- Reject a config extended by any other URL when it uses relative paths, which cannot be
  resolved from one fetched file
- Resolve a GitHub URL of a `SKILL.md` file in `resolveDirectInstallConfig` to the skill's
  directory, and name the skill after that directory. It resolved to the file and named
  the skill `skill`
- Run the install scripts of the packages that a git `extends` repository approves in the
  `allowScripts` field of its `package.json`. The install ran no script at all, so a package
  that downloads its binary in `postinstall`, such as `@vvago/vale`, had no binary and the
  hooks that call it stopped working after each install
- Install the dependencies of a git `extends` copy again when an earlier version of aix
  installed them

## [0.10.0] - 2026-11-25

### Added

- Add `installItem` and `removeItem`, which install one skill, MCP server, rule, or other
  item into editors without an `ai.json` and remove only what that install created, so a
  CLI or library can install its own skill
- Declare `sideEffects: false`, so a bundler can drop the exports a caller does not use
- Add the `AIX_USER_HOME` environment variable (exported as `USER_HOME_ENV_VAR`), which the
  Node runtime adapter's `os.homedir()` returns ahead of `HOME` and `USERPROFILE`
- Add `findNativeItemPath`, which locates the native file for a named skill, rule, prompt,
  or agent through the editor's importer
- Add `listAllBackups`, `pruneBackups`, and `getBackupStoreDir`; `restoreBackup` can now
  find the original path itself and backs up the file it replaces
- Declare the MIT license in `package.json`
- Export `replaceFile`
- Add the `installExtendsDependencies` load option (`installDependencies` on
  `resolveExtends`), which lets a caller that only reads a config skip the package install
  for a git `extends`
- Back up whole directories: `createBackup` copies a directory, `restoreBackup` puts it
  back without files added since, and `listAllBackups` reports `isDirectory`
- Add `ConfigParseError.reason`, the description of the problem without the file name or
  the list of issues

### Changed

- Upgrade `nypm` to 0.6.12, which cuts the packages installed with this one from 39 to 16
- Parse frontmatter with `js-yaml` instead of `yaml`. `js-yaml` has an ESM build, so an ESM
  bundle of this package no longer needs a `require` function
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
- Remove `applyGlobalChanges`, `removeFromGlobalMcpConfig`, `summarizeGlobalChanges`, and
  the `autoConfirmGlobal` apply option. Their write paths were unreachable from an install
  and overwrote a global config file that failed to parse. `planGlobalChanges` replaces
  the first
- Remove `EmbeddedConfigUpdateError`, which nothing threw

### Fixed

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
- Keep a Codex rule glob such as `../../other/**` from writing `AGENTS.md` outside the
  project, and stop treating a glob that names one file as a directory
- Remove `astro`, `@astrojs/starlight`, `@astrojs/vercel`, `vitest`, `c12`, and `defu`
  from the runtime dependencies; none is imported
- Keep the comments, key order, and formatting of `~/.codex/config.toml` and Grok's
  `config.toml` when adding, changing, or removing an MCP server; every write used to
  re-serialize the whole file
- Write editor config, aix state, and `ai.json` through a temporary file that is renamed
  into place, so an interrupted write cannot leave a truncated file. The file keeps its
  permissions, and a symlinked config is written through, not replaced
- Name a damaged install receipt and how to recover from it; a receipt that was not valid
  JSON failed every install with a bare parse error
- Read a state file that lacks sections added in later versions without failing
- Install editors one at a time in `installToEditors`; two at once raced on files that
  editors share
- Do not edit home-directory MCP config when `removeMcpFromEditor` targets project scope,
  or project config when it targets user scope for an editor with no user-level path
- Let a config that extends another change an inherited item's content source or MCP
  transport; the inherited source was merged in beside the new one and the result failed
  validation
- Send `GIGET_AUTH` only to git hosts; a source given as an `https://` URL received it as
  a bearer token
- Resolve a `user/repo#ref` reference on GitHub, as documented; it was looked up in
  giget's template registry
- Honor `aix.cache.maxBackups`, which the schema accepted and nothing read. Loading a
  config sets the limit, and `setMaxBackupsPerFile` sets it directly
- Write Zed user-scope config to `%APPDATA%\Zed` on Windows, where Zed reads it; aix
  wrote `~/.config/zed` on every platform
- Detect OpenCode on Windows by `~/.config/opencode`, where it keeps its config, and
  Antigravity on macOS by its application support directory; its list held an absolute
  `/Applications` path that was joined onto the home directory and never matched
- Update a config kept in the `ai` field of `package.json` inside that field.
  `updateConfig` wrote the changed sections to the top level of `package.json`, so
  `aix add --save` reported success and the item was never read
- Resolve the local overrides of a config in `package.json` to `ai.local.json`, the file
  discovery reads, and not to `package.local.json`
- Name `ai.local.json` in the error when that file has a syntax error. The error named
  `ai.json`
- Compute `ai.lock.json` from the config without `ai.local.json`. The lockfile is
  committed and the local overrides are not, so a lockfile that covered them matched only
  on the machine that wrote it. `LoadedConfig.sharedConfig` is the config before the
  overrides, and `writeLockfileForConfig` writes the lockfile from it
- Record a file outside the directory of `ai.json` relative to that directory in
  `ai.lock.json`, and leave out the download directory of a git skill. Both were absolute
  paths inside the entry digest, so the lockfile did not match on another machine

## [0.9.0] - 2026-11-23

- Changes to this package were not recorded for this release

## [0.8.2] - 2026-11-04

- Changes to this package were not recorded for this release

## [0.8.0] - 2026-10-01

- Changes to this package were not recorded for this release

## [0.7.0] - 2026-09-08

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
