---
title: Installation
slug: getting-started/installation
sidebar:
   order: 1
description: Install the aix CLI and set up your environment.
---

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

Follow the printed instructions to add the completion script to your shell profile (`.bashrc`, `.zshrc`, or Fish config).

## Update

aix can self-update:

```bash
aix update
```

## What's next

Create your first `ai.json` — follow the [Quick Start](/getting-started/quick-start/) guide.
