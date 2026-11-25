---
sidebar:
   order: 10
title: Skills
description: Reusable capabilities for your AI agent.
---

A **skill** is a directory of instructions and supporting files that teaches an AI agent how to
perform a specific task or work with a specific technology.

aix follows the [Agent Skills specification](https://agentskills.io) (v1).

## Structure

A skill is a directory containing a `SKILL.md` file.

```markdown
---
name: react-expert
description: Expert knowledge for React 19 and Next.js 14+
---

# React Expert

You are an expert in React. Follow these principles:

1. Always use functional components.
2. Prefer hooks for state management.
   ...
```

The frontmatter contains metadata, and the markdown body contains the instructions.

## Configuring skills

Add skills to the `skills` object in `ai.json`:

```json
{
   "skills": {
      "react": "aix-skill-react",
      "tailwindcss": {
         "git": "https://github.com/tailwindlabs/ai-skills",
         "path": "skills/tailwindcss"
      },
      "local-utils": "./skills/utils"
   }
}
```

### Source types

- **npm**: An installed package name (e.g. `aix-skill-react` or `@scope/skill`).
- **git**: A git URL, shorthand (`github:user/repo`), or repo-path source like `owner/repo/path-to-skill`. To target a subfolder explicitly, use the `path` option in the object form.
- **local**: A relative path to a directory containing a `SKILL.md`.

## Installing skills

When you run `aix install`, each skill is:

1. Resolved, and downloaded if it is remote.
2. Copied into a directory aix manages: `~/.aix/skills/{name}/` for a user-scope install (the
   default), or `.aix/skills/{name}/` inside the project with `--project`.
3. Symlinked from there into the skills directory each editor reads.

Every supported editor reads Agent Skills natively, so each one gets a real skill directory.
Some editors read the shared `.agents/skills/` folder and others have a directory of their
own. The exact project and user paths are on each editor page:
[Cursor](/editors/cursor/#cursor-feature-skills),
[GitHub Copilot](/editors/copilot/#copilot-feature-skills),
[Claude Code](/editors/claude-code/#claude-code-feature-skills),
[Windsurf](/editors/windsurf/#windsurf-feature-skills),
[Zed](/editors/zed/#zed-feature-skills),
[Codex](/editors/codex/#codex-feature-skills),
[Google Antigravity](/editors/antigravity/#antigravity-feature-skills),
[OpenCode](/editors/opencode/#opencode-feature-skills), and
[Grok CLI](/editors/grok/#grok-feature-skills).

`aix add skill` also accepts direct `SKILL.md` paths or blob URLs and normalizes them to the
containing skill directory.

To install one skill without creating `ai.json`, use direct install:

```bash
aix install ./skills/review --type skill --target claude-code --user
aix install github:org/aix-skills/review#v1.0.0 --type skill --target cursor --user
```

### Precedence with plugins

If your `ai.json` defines a skill that is also bundled inside an enabled
[plugin](/concepts/plugins/):

- **Editors with native plugin support, such as Claude Code**: the skill you configured takes
  precedence over the plugin's bundled version.
- **Editors without native plugin support, such as Codex, Windsurf, and Zed**: aix unpacks the
  plugin's skills and prefixes each with the plugin name (`<plugin>-<skill>`), so the names do
  not collide. If you define a skill with that exact prefixed name in `ai.json`, your
  definition replaces the unpacked one.

## Creating a skill

1. Create a directory: `mkdir skills/my-skill`
2. Create `skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Does x, y, and z
---

# Instructions

...
```

3. Save it to `ai.json` and install it:

```bash
aix add skill ./skills/my-skill --save --config-only
aix install
```

`--save` writes the reference to `ai.json`. Without it, `aix add skill` installs the skill into
your user-scope editor config and leaves `ai.json` unchanged.
