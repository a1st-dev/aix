---
sidebar:
   order: 1
title: Skills
description: Reusable capabilities for your AI agent.
---

A **Skill** is a package of instructions and context that teaches an AI agent how to perform a specific task or work with a specific technology.

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

The frontmatter contains metadata, and the markdown body contains the instructions (system prompt context).

## Configuring Skills

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

### Source Types

- **npm**: An installed package name (e.g. `aix-skill-react` or `@scope/skill`).
- **git**: A git URL, shorthand (`github:user/repo`), or repo-path source like `owner/repo/path-to-skill`. To target a subfolder explicitly, use the `path` option in the object form.
- **local**: A relative path to a directory containing a `SKILL.md`.

## Installing Skills

When you run `aix install`, skills are:

1. Resolved and downloaded (if remote) to `.aix/skills/{name}/`.
2. Symlinked into the location each editor reads. Every supported editor now has native
   Agent Skills support, so all of them get a real skill directory rather than a rule that
   points at one:
   - **Claude Code**: `.claude/skills/`.
   - **Cursor**: `.cursor/skills/`.
   - **GitHub Copilot**: `.github/skills/`.
   - **Google Antigravity**: `.agents/skills/`.
   - **OpenCode**: `.opencode/skills/`.
   - **Windsurf**: `.windsurf/skills/`.
   - **Grok CLI**: `.grok/skills/`.
   - **Codex** and **Zed**: `.agents/skills/`, the shared Agent Skills folder convention.

`aix add skill` also accepts direct `SKILL.md` paths or blob URLs and normalizes them to the containing skill directory before saving the reference.

When you install with `--user`, the canonical managed copy lives under `~/.aix/skills/{name}/` instead of the project-local `.aix/skills/{name}/`.

To install one skill without creating `ai.json`, use direct install:

```bash
aix install ./skills/review --type skill --target claude-code --user
aix install github:org/aix-skills/review#v1.0.0 --type skill --target cursor
```

### Precedence with Plugins

If your project defines a skill in `ai.json` that is also bundled inside an enabled [plugin](/concepts/plugins/):

- **Native Plugin Editors (e.g. Claude Code)**: The local project skill in `.claude/skills/<name>` takes precedence over the plugin's bundled version.
- **Non-Native Editors (e.g. Codex, Windsurf, Zed)**: Unpacked plugin skills are automatically prefixed with the plugin name (`${pluginName}-${skillName}`) to prevent naming collisions. If you explicitly author a skill with the exact same name in `ai.json`, your explicit configuration overrides the unpacked plugin version.

## Creating a Skill

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

3. Add it to `ai.json`:

```bash
aix add skill ./skills/my-skill
```
