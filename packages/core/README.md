# @a1st/aix-core

Core library for the [aix](https://github.com/a1st-dev/aix/blob/main/README.md) CLI.
Provides config loading, editor adapters, skill resolution, and file management utilities.

## Install config from your own tool

A CLI or library can install its own skill, MCP server, rule, or prompt into the user's AI
editors. No `ai.json` is involved and the user does not need `aix`.

```bash
npm install @a1st/aix-core zod@^4
```

```js
import { fileURLToPath } from "node:url";
import { detectEditors, installSkill, removeSkill } from "@a1st/aix-core";

const skill = { name: "my-cli", scope: "user" },
   detected = await detectEditors();

// Use displayName in a picker and pass the selected IDs to the installer.
const { results } = await installSkill({
   ...skill,
   source: { path: fileURLToPath(new URL("../skills/my-cli", import.meta.url)) },
   editors: detected.map(({ id }) => id),
});

for (const result of results) {
   console.log(result.editor, result.changes, result.errors);
}

// Later, remove the skill from its recorded editors.
await removeSkill(skill);
```

`detectEditors()` checks user config and data paths and returns objects such as
`{ id: "claude-code", displayName: "Claude Code" }`. Use
`detectEditors(projectRoot, { projectOnly: true })` to check project config, or
`getAvailableEditors()` to list every supported editor.

Named installers include `installMcpServer`, `installRule`, and `installPrompt`. Use
`installItem({ type, name, config, scope, editors })` when you choose the item type at
runtime. See [Use aix as a library](https://aix.a1st.dev/getting-started/use-as-a-library/)
for the full API and a setup prompt that lets users choose editors.

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
