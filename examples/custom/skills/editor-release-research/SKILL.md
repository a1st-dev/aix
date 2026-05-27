---
name: editor-release-research
description: Use when auditing supported editor release notes, checking whether aix editor integrations are stale, or creating a plan to update aix docs and implementation for editor config changes.
---

# Editor release research

Use this skill to keep aix aligned with the config formats used by supported editors and
agent tools.

## Workflow

1. Read `packages/schema/src/editor-support.ts` and collect the current
   `supportedEditorNames` values. These IDs are the only valid `editor_id` values for
   research documents.
2. For each editor ID, inspect `docs/editor-research/<editor_id>/` and identify the
   latest checked version already documented. If the folder is missing or empty, treat
   this as the first run and do not backfill old versions.
3. Research editor changes newer than the latest checked version. Prefer sources in this
   order:
   - Official editor changelog or release notes.
   - Official docs for the relevant config surface.
   - Official package metadata, such as `npm view <package> version`.
   - Official source repository releases or tags.
   - Third-party sources only when official sources do not expose the needed fact, and
     mark the fact as externally sourced.
4. Focus only on changes that affect aix implementation or end users:
   - Rules, instructions, memories, or `AGENTS.md` behavior.
   - Prompts, commands, skills, agents, subagents, or workflow files.
   - MCP config paths, schemas, transports, auth, tool naming, or server discovery.
   - Hook events, hook payloads, hook action fields, or hook execution behavior.
   - User/project/global config paths and precedence.
   - Security or permission changes that alter generated config safety.
5. Write one structured markdown document per editor/version pair:
   `docs/editor-research/<editor_id>/<editor_version>.md`.
6. Use this frontmatter shape:
   ```yaml
   ---
   research_performed_at: "2026-05-21T17:13:01-04:00"
   editor_id: "claude-code"
   editor_version: "2.1.147"
   sources:
      - "https://code.claude.com/docs/en/changelog"
   ---
   ```
7. In the body, include:
   - `## Changes affecting aix`
   - A bullet for each relevant change.
   - An indented `aix status:` bullet under every change explaining whether aix already
     supports it, needs a follow-up, or does not need code.
   - `## Baseline evidence` with local files, tests, git commits, or docs that show the
     current aix behavior.
8. After writing the research documents, load `.aix/skills/plan/SKILL.md` and create an
   implementation plan using the research as input. The plan must include steps to update
   each research document with how every documented change was addressed in this repo.
9. If the research finds no implementation change for an editor, still write the
   editor/version document and say why no aix change is needed.

## Source hints

These links are hints, not permanent contracts. Editor teams may move docs, rename
products, change package names, or split release notes across sites. Treat these as
starting points, then verify that each source is still official and current before using
it in a research document.

- Claude Code:
   - Changelog: `https://code.claude.com/docs/en/changelog`
   - Hooks docs: `https://code.claude.com/docs/en/hooks`
   - Settings docs: `https://code.claude.com/docs/en/settings`
   - Package metadata: `npm view @anthropic-ai/claude-code version`
- Codex:
   - Changelog: `https://developers.openai.com/codex/changelog`
   - Repository releases: `https://github.com/openai/codex/releases`
   - Package metadata: `npm view @openai/codex version`
- GitHub Copilot:
   - Custom agents docs:
     `https://docs.github.com/en/copilot/reference/custom-agents-configuration`
   - CLI changelog:
     `https://raw.githubusercontent.com/github/copilot-cli/main/changelog.md`
   - Package metadata: `npm view @github/copilot version`
- Cursor:
   - Changelog: `https://cursor.com/changelog`
   - Docs: `https://docs.cursor.com/`
- Gemini CLI:
   - Changelog index:
     `https://github.com/google-gemini/gemini-cli/blob/main/docs/changelogs/index.md`
   - Repository releases: `https://github.com/google-gemini/gemini-cli/releases`
   - Docs: `https://github.com/google-gemini/gemini-cli/tree/main/docs`
   - Package metadata: `npm view @google/gemini-cli version`
- OpenCode:
   - Config docs: `https://opencode.ai/docs/config/`
   - Agent docs: `https://opencode.ai/docs/agents/`
   - Repository releases: `https://github.com/anomalyco/opencode/releases`
   - Package metadata: `npm view opencode-ai version`
- Windsurf:
   - Changelog: `https://windsurf.com/changelog`
   - Docs: `https://docs.windsurf.com/`
- Zed:
   - Stable releases: `https://zed.dev/releases/stable`
   - Docs: `https://zed.dev/docs`
   - Repository releases: `https://github.com/zed-industries/zed/releases`

## Verification

Run these commands after updating research documents or the docs page:

```sh
npm run standards
npm test
npm run build
```

If the full suite is too broad for the current change, run the narrow package tests first,
then run the full commands before final verification.
