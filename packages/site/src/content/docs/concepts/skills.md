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
      "react": "^1.0.0",
      "tailwindcss": "github:tailwindlabs/ai-skills",
      "local-utils": "./skills/utils"
   }
}
```

### Source Types

- **npm**: A package name (e.g. `aix-skill-react` or `@scope/skill`).
- **git**: A git URL or shorthand (`github:user/repo`). To target a subfolder, use the `path` option in the object form.
- **local**: A relative path to a directory containing a `SKILL.md`.

## Installing Skills

When you run `aix install`, skills are:

1. Resolved and downloaded (if remote) to `.aix/skills/{name}/`.
2. Symlinked or copied to the appropriate location for each editor:
   - **Cursor**: Symlinked from `.cursor/skills/`.
   - **VS Code**: Symlinked from `.github/skills/` (native Agent Skills support).
   - **Claude Code**: Symlinked from `.claude/skills/`.
   - **Codex**: Symlinked from `.codex/skills/`.
   - **Windsurf**: Symlinked from `.windsurf/skills/`.
   - **Zed**: Skill content added as pointer rules (no native Agent Skills).

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
