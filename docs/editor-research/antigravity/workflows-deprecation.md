---
research_performed_at: "2026-10-01T11:05:00-04:00"
editor_id: "antigravity"
editor_version: "2.0.0"
sources:
   - "https://github.com/google-gemini/gemini-cli/releases"
   - "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/changelogs/index.md"
---

## Changes affecting aix

- Google Antigravity deprecated standalone Workflows (`.agents/workflows/*.md` and
  `~/.gemini/config/workflows/*.md`) in favor of standard Agent Skills
  (`.agents/skills/{name}/SKILL.md`), with official workflow retirement scheduled for
  November 1, 2026 and an upstream `/migrate-workflows` conversion command provided.
   - aix status: addressed 2026-10-01. Prompts are no longer deployed as workflow markdown
     files for Antigravity (`AntigravityPromptsStrategy.isSupported()` returns `false`).
     Instead, `AntigravityAdapter` now leverages `installPromptsAsSkills` to convert
     prompts into instruction-only Agent Skills under `.agents/skills/{name}/` (or
     `prompt-{name}` when conflicting with an existing skill name), matching the pattern
     used by Codex and Zed.
   - Legacy workflow file reading during import is preserved to assist migrations.

## Baseline evidence

- `packages/core/src/editors/strategies/antigravity/prompts.ts` marks prompt deployment
  unsupported (`isSupported(): false`) while preserving legacy file parsing.
- `packages/core/src/editors/adapters/antigravity.ts` converts prompts to skills via
  `installPromptsAsSkills`.
- `packages/schema/src/editor-support.ts` documents the prompt-to-skill shim for
  Antigravity.
- `packages/core/src/__tests__/editors/adapters.test.ts` verifies prompt-to-skill
  installation and conflict resolution into `.agents/skills/`.
