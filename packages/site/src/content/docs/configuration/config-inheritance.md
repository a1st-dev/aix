---
sidebar:
   order: 3
title: Config inheritance
description: Share and layer configurations using the extends field.
---

The `extends` field in `ai.json` inherits configuration from other sources. A team can keep a
shared base config with its standard rules, skills, and MCP servers, and each project can add
to it or override parts of it.

## Usage

The `extends` field accepts a string or an array of strings.

```json
{
   "extends": "github:my-org/ai-standards"
}
```

Multiple sources are supported. They are processed in order, with later configurations overriding earlier ones:

```json
{
   "extends": [
      // 1. Base company standards
      "github:company/ai-base",

      // 2. Team specific overrides
      "github:team-platform/ai-config",

      // 3. Local file mixin
      "./configs/react-project.json"
   ]
}
```

The final configuration is the result of merging all extended configs and then your project's
`ai.json`.

## Source types

aix supports extending from:

### npm packages

```json
{ "extends": "@company/aix-config" }
```

The package must have an `ai.json` at its root and must already be installed in the project.
aix does not install it for you.

### Git repositories

Use the shorthand syntax `provider:user/repo`:

```json
{ "extends": "github:company/repo" }
```

You can target a specific branch, tag, or commit hash:

```json
{ "extends": "github:company/repo#v2.0.0" }
```

The repository must have an `ai.json` at its root. To use a config in a subdirectory, add the
directory to the shorthand, as in `github:company/repo/configs/web`. That directory must then
contain the `ai.json`.

aix keeps a copy of the repository under `.aix/extends/`, and installed hooks run their scripts
from that copy. If the repository has a `package.json`, `aix install` installs its dependencies
there with npm, without running the packages' lifecycle scripts. Commands that only read the
config, such as `aix validate` and `aix install --dry-run`, never run npm. When the extended
config has changed in a way that needs an install, they keep reading the copy that is already
installed until the next `aix install`.

Some packages do not work until their install script has run. A package that downloads a binary
in `postinstall` is one example. To run the install scripts of such a package, approve it in the
`allowScripts` field of the repository's `package.json`. This is the field that npm reads its own
install script policy from, and `npm approve-scripts` writes it:

```json
{
   "devDependencies": {
      "@vvago/vale": "3.17.1"
   },
   "allowScripts": {
      "@vvago/vale@3.17.1": true
   }
}
```

After the install, aix runs `npm rebuild` for the packages set to `true` and for no others. Use a
package name, or a name and an exact version. npm rejects any other kind of key, and the install
then fails and keeps the copy that was already installed. A package without an entry, or with an
entry set to `false`, runs no script. If your own npm config sets `ignore-scripts`, npm runs none
of them.

### URLs

Direct HTTPS URLs to a JSON file. Plain HTTP is rejected.

```json
{ "extends": "https://raw.githubusercontent.com/user/repo/main/ai.json" }
```

aix fetches that one file and nothing beside it, so the config cannot use relative paths
for its skills, rules, prompts, or agents. aix rejects a config that does, and
`aix validate` reports it.

A GitHub file URL (`https://github.com/user/repo/blob/<ref>/<path>`) is the exception. aix
treats it as the [git source](#git-repositories) for the file's directory, so
`https://github.com/company/repo/blob/main/configs/web/ai.json` behaves like
`github:company/repo/configs/web#main`. The directory is copied to `.aix/extends/`, and
relative paths in the config resolve inside it. The file can have any name. A path that
leaves the directory, such as `../shared/rules.md`, does not resolve: extend the directory
that contains everything the config uses.

### Local paths

Relative paths to other JSON files:

```json
{ "extends": "../shared/ai.json" }
```

## Merge logic

aix deep-merges the extended configs in order and then merges your `ai.json` on top:

- **Objects are merged key by key, at every level.** Every section is inherited this way:
  `skills`, `mcp`, `rules`, `prompts`, `agents`, `hooks`, `plugins`, `marketplaces`,
  `editors`, and `aix`. An item you do not mention is kept as the extended config defines it.
- **An item with the same name is merged field by field.** If a base config defines an MCP
  server and your `ai.json` sets only its `env`, the server keeps the base `command` and
  `args`.
- **Choosing a different source replaces the inherited one.** A rule, prompt, or agent has one
  content source (`content`, `path`, `git`, or `npm`), and an MCP server has one transport
  (`command` or `url`). If your `ai.json` sets a different one for an inherited item, the
  inherited source is dropped and the item's other fields are kept.
- **Arrays and plain values are replaced.** Your `args` array replaces the inherited one. The
  same goes for the list of hooks under one event: defining `pre_tool_use` in your `ai.json`
  replaces the inherited `pre_tool_use` hooks, while inherited hooks for other events stay.
- **`false` disables an inherited item.** Set a skill, rule, prompt, agent, MCP server, plugin,
  or marketplace to `false` to turn it off.
- **`editors` merges per editor in object form.** If either side uses the array form, your
  value replaces the inherited one.

Relative paths in an extended config are resolved against that config's own location, so a
rule such as `"./rules/style.md"` in a shared config still points at the shared file. The
same applies to script paths in simple hook commands, such as `node ./hooks/check.mjs`.

This is different from [`ai.local.json`](/configuration/ai-local-json/), where an entry
replaces the entry with the same name as a whole.

This example disables an inherited rule. The base config (`github:company/base`) defines it:

```json
{
   "rules": {
      "always-add-tests": { "content": "..." }
   }
}
```

Your config turns it off:

```json
{
   "extends": "github:company/base",
   "rules": {
      "always-add-tests": false
   }
}
```

## Resolution process

1. Each entry in `extends` is loaded in order. If an extended config has its own `extends`,
   that is resolved first. A config that ends up extending itself is an error.
2. The loaded configs are merged in order.
3. Your `ai.json` is merged on top.
4. `ai.local.json`, if present, is applied last.

Git sources are downloaded each time aix loads the config. aix keeps a copy of each one under
`.aix/extends/` so that the files it refers to stay available, and rebuilds that directory on
every load.

To see the final result of this process, run:

```bash
aix config show --resolved
```
