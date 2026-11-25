# @a1st/aix-core

Core library for the [aix](https://github.com/a1st-dev/aix/blob/main/README.md) CLI.
Provides config loading, editor adapters, skill resolution, and file management utilities.

## Install config from your own tool

A CLI or library can install its own skill, MCP server, rule, or prompt into the user's AI
editors. No `ai.json` is involved and the user does not need `aix`.

```bash
npm install @a1st/aix-core
```

```js
import { fileURLToPath } from "node:url";
import { detectEditors, installItem, removeItem } from "@a1st/aix-core";

const skill = { section: "skills", name: "my-cli", scope: "user" },
   editors = await detectEditors(process.cwd());

// Copies the skill to ~/.aix/skills/my-cli and links it into each editor's skills directory.
const { results } = await installItem({
   ...skill,
   value: { path: fileURLToPath(new URL("../skills/my-cli", import.meta.url)) },
   editors,
});

for (const result of results) {
   console.log(result.editor, result.success ? "installed" : result.errors.join(", "));
}

// Later: deletes only what installItem created.
await removeItem(skill);
```

`section` is a section of `ai.json` (`skills`, `mcp`, `rules`, `prompts`, `agents`, `hooks`,
`plugins`, `marketplaces`) and `value` is what `ai.json` would have under `name`. aix backs up
every file before it changes it. See
[Install from your own tool](https://aix.a1st.dev/getting-started/use-as-a-library/) for a
setup prompt, subcommands, the options, and bundling notes.

## Other exports

The `aix` CLI is built on this package, which also exports:

- **Config discovery and loading**: `loadConfig` finds and parses `ai.json` and resolves
  `extends`
- **Editor adapters**: `installToEditor` writes a whole config in one editor's format
- **Skill resolution**: `resolveAllSkills` loads skills from local paths, git repos, or npm
  packages
- **Safe file updates**: `updateConfig`, `createBackup`, and `replaceFile`

## License

MIT
