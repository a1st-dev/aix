# @a1st/aix-core

Core library for the [aix](https://github.com/a1st-dev/aix/blob/main/README.md) CLI.
Provides config loading, editor adapters, skill resolution, and file management utilities.

## Role in aix

This package is used internally by `@a1st/aix` (the CLI). It handles:

- **Config discovery & loading** — Find and parse `ai.json` files, resolve `extends`
- **Editor adapters** — Write rules, prompts, skills, and MCP config to each editor's format
- **Skill resolution** — Load skills from local paths, git repos, or npm packages
- **Remote loading** — Fetch configs from GitHub URLs, git shorthand, or local paths
- **Safe file updates** — Atomic writes with backup and rollback

## Key Exports

```typescript
import {
  loadConfig,           // Load ai.json from path or remote source
  installToEditor,      // Install config to a specific editor
  resolveAllSkills,     // Resolve skill references to parsed skills
  updateConfig,         // Safely update ai.json with backup
  mergeConfigs,         // Merge two configs together
} from '@a1st/aix-core';
```

## Installation

```bash
npm install @a1st/aix-core
```

> **Note:** This package is primarily for internal use. Most users should install
> `@a1st/aix` (the CLI) instead.

## License

MIT
