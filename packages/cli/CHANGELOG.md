# Changelog

All notable changes to this package will be documented in this file.

Packages in this monorepo are versioned and released together, so a
version may appear here with no changes to this package.

## [Unreleased]

### Fixed

- Install skills, rules, prompts, and agents that a config extended by a GitHub blob URL
  refers to with relative paths. `aix install` looked for them in the local project and
  failed, while `aix validate` reported the config as valid
- Report relative paths in a config extended by any other URL as an error in
  `aix validate` and `aix install`
- Install a skill from the GitHub URL of its `SKILL.md` file with
  `aix install <url> --type skill`. It failed with "SKILL.md not found"; `aix add skill`
  already accepted the same URL
- Make `aix install` run the install scripts of the packages that a git `extends` repository
  approves in the `allowScripts` field of its `package.json`. No script ran before, so a hook
  that depends on a binary downloaded in `postinstall`, such as vale, stopped working after
  each install

## [0.10.0] - 2026-11-25

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
- Resolve the scope the same way in every command: a scope flag, then the `scope` in
  `ai.json`, then user scope. `aix add --save` ignored the config's scope, and
  `aix search` defaulted to project scope for a config that `aix install` installed at
  user scope
- Retry a failed search with Ctrl+R in `aix search`; a plain `r` was also typed into the
  query, as was the `?` that toggles help
- Name the flag that changes `ai.json` and leaves the editors alone `--config-only` on
  every `aix add` and `aix remove` command. `--no-install`, `--no-sync`, and `--no-delete`
  are still accepted on all of them
- Give each short flag one meaning on every command. `-d` is `--dry-run`, `-s` is
  `--save`, `-t` is the editor to write to, `-p` is `--project`, and `-r` is `--ref`. The
  other flags that used those letters lost them: `--description` on `aix add`, `--scope`
  on `aix sync`, `--type` and `--plain` on `aix search`, and `--resolved` on
  `aix config show`. `aix sync` accepts `--target` as another name for `--to`

### Removed

- Remove about 450 lines of `aix list` code that nothing called
- Remove `aix update` and the background update check that ran with every command. They
  looked for release tarballs that were never published, so the command could not succeed.
  Update with `npm install -g @a1st/aix@latest`
- Remove the `--registry` flag of `aix search`. It was accepted and never read: skills
  come from skills.sh and MCP servers from the official MCP Registry

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
- Record the scope in `ai.json` when `aix init` is given `--project` or `--scope project`,
  so a later `aix install` stays in the project
- Leave global-only editor config untouched in a project-scope `aix add` or
  `aix remove mcp`, as `aix install --project` already does
- Accept several sources in `aix add agent`; the default value of `--mode` made every
  multi-source call fail
- Back up a rule, prompt, or agent file before `aix remove` deletes it, and the `ai.json`
  that `aix init --force` replaces
- Say that nothing matched when `aix remove skill`, `rule`, `prompt`, or `agent` finds no
  such item, without asking for confirmation first
- Ask to remove a plugin or marketplace "from editor configs" unless `--save` is passed;
  the question always named `ai.json`
- Show subcommands with spaces in help output (`list skills`, not `list:skills`), and stop
  every `list` subcommand from claiming the `ls` alias
- Write `ai.json` through a temporary file in `aix init` and `aix install --save`
- Stop `aix validate`, `aix install --dry-run`, and every other command that only reads
  the config from running a package manager for a git `extends`; only a real `aix install`
  does
- Back up a skill directory before `aix remove skill` deletes it
- Show why an install or uninstall failed in `aix search`; a failure only left the check
  mark off
- Remove an MCP server from the editors, not only from `ai.json`, when it is uninstalled
  in `aix search`
- Print JSON from `aix search --json` when there are no results
- Mark the skills and MCP servers that `ai.json` already declares as installed in
  `aix search`; every result looked uninstalled
- Reject `--scope` combined with `--user` or `--project`. A command given
  `--scope project --user` used to follow `--scope` and ignore the other flag
- Make `aix cache clear` clear the cache beside the `ai.json` it finds, as
  `aix install --clean` does. Run from a subdirectory, it used to report an empty cache
  and delete nothing
- Reject `--local`, `--lock`, and `--config-only` on `aix remove` without `--save`, as
  `aix add` does. They were ignored without a message
- Leave the list of editors out of the `aix remove` preview when `--config-only` means no
  editor is changed
- Report a user-level change that `aix add` skipped, such as a Codex or Windsurf MCP
  server in CI. The command used to print nothing and exit 0
- Fail `aix install` with a non-zero exit status when no editor is detected and none is
  named. It used to print a warning, install nothing, and exit 0, and with `--json` it
  printed nothing
- Stop `aix validate` from running a package manager for a git `extends` that has a
  `package.json`
- Make `ai.lock.json` match on every machine: it no longer covers `ai.local.json` or
  absolute paths. Run `aix validate --lock` once to refresh a lockfile that was written
  with local overrides, a git skill, or a file outside the project
- Refresh an existing `ai.lock.json` after `aix install <source> --save` changes
  `ai.json`, as `aix add --save` does. The command used to save `ai.json` and then stop on
  the lockfile it had just made stale
- Reject `--lock` combined with `--local` on `aix add` and `aix remove`. The lockfile does
  not cover `ai.local.json`, and `aix remove` ignored the flag without a message
- Print how to refresh a stale `ai.lock.json` on every command. Only `aix validate`
  printed the instruction; the other commands listed digests and nothing else
- Fail `aix add` with a non-zero exit status when no editor is detected and `--save` was
  not passed, so the command changed nothing. With `--save` the message stays a warning

## [0.9.0] - 2026-11-23

- Changes to this package were not recorded for this release

## [0.8.2] - 2026-11-04

- Changes to this package were not recorded for this release

## [0.8.0] - 2026-10-01

- Changes to this package were not recorded for this release

## [0.7.0] - 2026-09-08

- Changes to this package were not recorded for this release

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
