---
sidebar:
   order: 0
title: Introduction
description: What aix is, what ai.json holds, and where to start in these docs.
---

aix is a command-line tool that keeps the configuration of AI coding editors in one file. You
describe your setup once in `ai.json`, and aix writes it into each editor's own format and
location. It can also read the config an editor already has, either to create `ai.json` from it
or to copy it to another editor.

## What ai.json holds

`ai.json` is a JSON file, usually at the root of a project. It can contain:

- [Skills](/concepts/skills/): folders of instructions an agent loads for a specific task.
- [Rules](/concepts/rules/): instructions an editor applies to every request, or to matching
  files.
- [Prompts](/concepts/prompts/): reusable commands you run by name.
- [MCP servers](/concepts/mcp-servers/): external tools and data sources.
- [Agents](/concepts/agents/): instruction profiles for specialized work.
- [Hooks](/concepts/hooks/): commands that run on editor lifecycle events.
- [Plugins and marketplaces](/concepts/plugins/): bundles of the items above, and the catalogs
  they come from.

Editors do not all support the same features. The
[support matrix](/editors/supported-editors/) shows what aix writes for each one.

## Where aix writes

aix writes editor config at one of two scopes. User scope is the editor config under your
home directory, such as `~/.claude.json`, and it applies to every project you open. Project
scope is the editor config inside the current project, such as `.mcp.json`.

`aix add` and `aix remove` work at user scope unless you pass `--project`. `aix install` uses
the `scope` field of `ai.json` and falls back to user scope, and it prints the scope before it
writes. [User scope and project scope](/concepts/scopes/) has the rule for every command.

`aix install --dry-run` lists the files an install would change, with their paths, without
writing them.

aix keeps its own copies and records in a `.aix/` directory in the project and in `~/.aix/`.
Before it changes a file that already exists, it saves a copy that you can restore:

- [What aix writes and where](/concepts/files-and-directories/): the files and directories
  aix creates, and which ones to commit.
- [Backups and restore](/concepts/backups-and-restore/): how to list backups, put a file
  back, and undo an install.

## Where to go next

- [Installation](/getting-started/installation/): install the CLI.
- [Quick start](/getting-started/quick-start/): create an `ai.json` and install it.
- [Import from an editor](/getting-started/import-from-editor/): start from the config an
  editor already has.
- [ai.json reference](/configuration/ai-json-reference/): every field in the file.
- [CLI reference](/cli/overview/): every command and flag.
- [Supported editors](/editors/supported-editors/): the support matrix and per-editor paths.
