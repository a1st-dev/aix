---
sidebar:
   order: 4
title: What aix writes and where
description: The config files aix reads, the .aix directories it keeps, and which of them to commit.
---

aix works with three groups of files: the config files you write, the directories where it
keeps its own copies and records, and the editor config it installs into.

## Config files

These sit together, usually at the root of a project.

| File            | Purpose                                                                                        | Commit it          |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| `ai.json`       | The config aix installs. See the [reference](/configuration/ai-json-reference/).               | Yes                |
| `ai.local.json` | Your own overrides, merged over `ai.json`. See [ai.local.json](/configuration/ai-local-json/). | No                 |
| `ai.lock.json`  | Optional lockfile. When it exists, aix stops if the resolved config no longer matches it.      | Yes, if you use it |

aix finds `ai.json` by looking in the working directory and then in each parent directory. A
`package.json` with an `ai` field counts too, either as the config itself or as a path to it.
Commands that read `ai.json` also accept `--config <path>`.

aix changes these files only when you ask it to: `aix init` creates `ai.json`, `--save` on
`aix add`, `aix remove`, and `aix install` edits `ai.json` (or `ai.local.json` with
`--local`), `aix config set` edits `ai.json`, and `--lock` writes `ai.lock.json`.

## The `.aix` directory in a project

aix creates `.aix/` beside `ai.json` the first time it needs to store something there.

| Path              | Contents                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.aix/skills/`    | One directory per skill installed at project scope. Each editor's skill directory is a link to the copy here.                                                     |
| `.aix/imported/`  | Rule, prompt, agent, and skill files copied in by `aix init --from` and `aix install --save --copy`. `ai.json` refers to them by path.                            |
| `.aix/extends/`   | A copy of each config that `ai.json` pulls in from a git repository through `extends`.                                                                            |
| `.aix/installs/`  | One receipt per config source and editor, listing what that install wrote at project scope. The next install uses it to remove entries that have left the config. |
| `.aix/state.json` | The names of the items aix installed at project scope and the editors they went to. `aix list` uses it to label an item `aix` or `external`.                      |
| `.aix/.tmp/`      | The cache: git and npm sources that aix downloaded, and temporary files. aix can rebuild all of it.                                                               |

`aix cache clear` and `aix install --clean` delete `.aix/.tmp/` and nothing else. See
[`aix cache`](/cli/cache/).

### What to commit

Commit `ai.json`, `ai.lock.json` if you use one, and `.aix/imported/`. `ai.json` points at
the files in `.aix/imported/`, so an install on another machine fails without them.

Ignore `ai.local.json` and the rest of `.aix/`. It is either rebuilt by aix or specific to
one machine:

```text
# .gitignore
ai.local.json
.aix/*
!.aix/imported/
```

A project-scope install links each editor's skill directory to `.aix/skills/`. If you commit
those links, they point at nothing on a fresh clone until someone runs `aix install` there.

## The `.aix` directory in your home directory

`~/.aix/` holds the same records for user-scope installs, and the one backup store that both
scopes share.

| Path                | Contents                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.aix/skills/`    | One directory per skill installed at user scope.                                                                                      |
| `~/.aix/installs/`  | Receipts for user-scope installs.                                                                                                     |
| `~/.aix/state.json` | The names of the items aix installed at user scope.                                                                                   |
| `~/.aix/backups/`   | Copies of files, taken before aix changed or deleted them at either scope. See [Backups and restore](/concepts/backups-and-restore/). |

With `--user-home <dir>` or `AIX_USER_HOME`, aix uses `<dir>/.aix/` in place of `~/.aix/`. See
[Using an alternate home directory](/cli/overview/#using-an-alternate-home-directory).

## Editor config

The files aix installs into belong to the editors, and each editor has its own paths. The
[Supported editors](/editors/supported-editors/) page links to a page per editor that lists
the user-scope and project-scope path for every feature. To see the paths for your own
config before anything is written, run `aix install --dry-run`.

aix shares most of these files with you and with the editor, so it changes only its own part
of each one.

### Markdown files with a managed section

Some editors keep all rules in one Markdown file that you may also edit by hand, such as
`AGENTS.md`, `~/.claude/CLAUDE.md`, or `~/.gemini/GEMINI.md`. aix puts its content between
two comments and leaves everything outside them alone:

```text
<!-- BEGIN AIX MANAGED SECTION — DO NOT EDIT -->
...content written by aix...
<!-- END AIX MANAGED SECTION -->
```

- If the file has no such section yet, aix appends one at the end.
- On later installs, aix replaces only the text between the two comments.
- When aix has nothing left to write, it removes the section and the comments.

Edits you make between the comments are lost on the next install. Put your own text above or
below the section.

### JSON and TOML files

In settings files such as `~/.claude.json`, `.mcp.json`, or `~/.codex/config.toml`, aix adds,
changes, or removes the entries it installs and keeps the other keys. Comments and
formatting in Codex and Grok CLI `config.toml` files are kept.

### Files aix creates

Rules, prompts, and agents that an editor stores as one file each are written as whole
files. A skill is a link from the editor's skill directory to the copy under `.aix/skills/`.
If a skill directory with the same name already exists and aix did not create it, the
install stops for that editor and names the path.

### How files are replaced

aix writes new content to a temporary file beside the target and renames it into place, so
an interrupted write cannot leave a half-written file. The file keeps its permissions. A
config file that is a symbolic link is written through the link.

Before aix changes or deletes a file that already exists, it copies the file to
`~/.aix/backups/`. See [Backups and restore](/concepts/backups-and-restore/).
