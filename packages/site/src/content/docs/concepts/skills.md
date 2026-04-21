---
slug: concepts/skills
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
2. Symlinked or copied to the appropriate location for each editor:
   - **Cursor**: Symlinked from `.cursor/skills/`.
   - **GitHub Copilot**: Symlinked from `.github/skills/` (native Agent Skills support).
   - **Claude Code**: Symlinked from `.claude/skills/`.
   - **Codex**: Project skills are symlinked from `.agents/skills/`.
   - **Windsurf**: Symlinked from `.windsurf/skills/`.
   - **Zed**: Skill content added as pointer rules (no native Agent Skills).

`aix add skill` also accepts direct `SKILL.md` paths or blob URLs and normalizes them to the containing skill directory before saving the reference.

When you install with `--user`, the canonical managed copy lives under `~/.aix/skills/{name}/` instead of the project-local `.aix/skills/{name}/`.

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
