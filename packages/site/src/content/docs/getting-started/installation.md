---
title: Installation
sidebar:
   order: 1
description: Install the aix CLI and set up your environment.
---

aix is a command-line tool distributed on npm as `@a1st/aix`. Install it globally to get the
`aix` command.

## Requirements

- **Node.js** ≥ 20.19.0 or ≥ 22.12.0
- **npm** ≥ 10.0.0

## Install

```bash
npm install -g @a1st/aix
```

Verify the installation:

```bash
aix --version
```

## Shell autocomplete

aix supports tab completion for commands and flags. Set it up with:

```bash
aix autocomplete
```

Follow the printed instructions to add the completion script to your shell profile. The
supported shells are bash, zsh, and PowerShell.

## Update

aix is distributed through npm, so update it the way you installed it:

```bash
npm install -g @a1st/aix@latest
```

`aix version` prints the version you have.

## What's next

- New to aix? Read the [Introduction](/getting-started/introduction/) for what it does and
  where it writes.
- Follow the [Quick start](/getting-started/quick-start/) to create your first `ai.json`.
- Already have editor config? [Import it](/getting-started/import-from-editor/).
