# aix: Editor Integration Update Plan (2026-07-19)

## 1) Context

This plan is the output of an `editor-release-research` pass performed on 2026-07-19.
It is based on the eight research documents added in `docs/editor-research/` for:
Claude Code 2.1.215, Codex 0.144.6, Copilot CLI 1.0.71, Cursor 3.11, Gemini CLI
0.51.0, OpenCode 1.18.3, Windsurf/Devin Desktop 3.4.27, and Zed 1.11.3.

Note: the research skill references `.aix/skills/plan/SKILL.md`, which does not exist
in this repository checkout, so this plan follows the structure of the previously
committed `docs/implementation-plan.md` instead.

Note: an unmerged branch `editor-release-research-june-2026-18136254819821240469`
contains an earlier partial pass (including a `devin-desktop` adapter experiment).
This plan does not depend on it; reconcile or delete that branch when picking up the
work below.

## 2) Summary

No editor made a breaking change to a config surface aix writes. The highest-value
follow-ups are: correcting the Windsurf user-scope hooks path, deciding the Copilot
project MCP target file, and adding small validations (Copilot agent filenames, Zed
skill description length). Everything else is verification or watch-item work.

## 3) Objectives & Scope

- In scope:
   - Verifying and correcting paths in `packages/schema/src/editor-support.ts`.
   - Small strategy changes in `packages/core/src/editors/strategies/`.
   - Updating the research skill's stale source-hint URLs.
   - Updating each research document with resolution notes as items land.
- Out of scope:
   - Modeling editor runtime behaviors (approval modes, subagent depth limits).
   - Backfilling research for versions older than the previous checked versions.
   - A `devin-desktop` editor ID split (tracked as an open question).

## 4) Work Items

Status updated 2026-07-19 after the implementation pass on this branch.

### P1 — Likely bugs or user-visible gaps

- WI-1 (Windsurf) — DONE 2026-07-19: User-scope hooks path corrected to
  `~/.codeium/windsurf/hooks.json` in
  `packages/core/src/editors/strategies/windsurf/hooks.ts` and
  `packages/schema/src/editor-support.ts`, with a locking test. The site docs already
  documented the correct path, confirming the strategy was the outlier.
  Research: `docs/editor-research/windsurf/3.4.27.md`.
- WI-2 (Copilot) — DONE 2026-07-19 (no code change): The Copilot CLI config-dir
  reference documents both `.mcp.json` and `.github/mcp.json` as project MCP files,
  so aix keeps writing `.mcp.json` and importing either. Support-matrix note updated.
  Research: `docs/editor-research/copilot/1.0.71.md`.

### P2 — Validations and hardening

- WI-3 (Copilot) — DONE 2026-07-19: `sanitizeFileName` already prevents leading-dot
  filenames; added a regression test covering hidden agent filenames.
  Research: `docs/editor-research/copilot/1.0.71.md`.
- WI-4 (Zed) — DONE 2026-07-19: `validateSkill` now warns when a skill description
  exceeds 1024 bytes, with tests.
  Research: `docs/editor-research/zed/1.11.3.md`.
- WI-5 (Claude Code) — DONE 2026-07-19: The 2.1.214 `if:` glob semantics change is
  documented in the Claude Code hooks notes in `packages/schema/src/editor-support.ts`.
  Research: `docs/editor-research/claude-code/2.1.215.md`.

### P3 — Verification-only items

- WI-6 (Zed) — OPEN: Confirm `context_servers` remains the on-disk MCP key in Zed
  settings after the 1.10.0 settings-editor consolidation, and confirm `.rules` /
  `~/.config/zed/AGENTS.md` remain documented instruction surfaces (Zed docs were
  unreachable through the research proxy; requires direct docs access or a real
  install).
- WI-7 (Gemini) — PARTIALLY DONE 2026-07-19: Unknown-key preservation in
  `.gemini/settings.json` is covered by an existing test. OPEN: verify on a real
  Gemini CLI install that symlinked skill directories still load under the
  0.49.0/0.51.0 symlink hardening.
- WI-8 (Windsurf) — OPEN: Investigate whether Devin Desktop now documents a
  file-backed subagent config (3.3.18 "subagents configurable with default model");
  if so, consider upgrading Windsurf agents from `unsupported`.
- WI-9 (Windsurf) — DONE 2026-07-19 (already implemented): `show_output` and
  `working_directory` were already passed through by the Windsurf hooks strategy.
  OPEN: skill `permissions:` frontmatter passthrough remains a watch item until aix
  skills carry permission metadata.

### P4 — Repo housekeeping

- WI-10 (Skill) — DONE 2026-07-19: Source hints updated — Codex changelog now
  `https://learn.chatgpt.com/docs/changelog`; Windsurf changelog now
  `https://docs.devin.ai/desktop/changelog`.
- WI-11 (Watch items, no code) — OPEN: Gemini CLI ↔ Antigravity transition (possible
  future rebrand of `.gemini/` paths); Cursor team/workspace customization scopes
  (currently cloud-managed, not file-backed); Windsurf "Devin Desktop" display naming.

## 5) Research document upkeep

For every work item above, when it is resolved (implemented, verified, or rejected),
update the matching research document's `aix status:` bullet in place with how it was
addressed, referencing the commit or test. The research documents to maintain are:

- `docs/editor-research/claude-code/2.1.215.md` (WI-5)
- `docs/editor-research/codex/0.144.6.md` (WI-10)
- `docs/editor-research/copilot/1.0.71.md` (WI-2, WI-3)
- `docs/editor-research/cursor/3.11.md` (WI-11)
- `docs/editor-research/gemini/0.51.0.md` (WI-7, WI-11)
- `docs/editor-research/opencode/1.18.3.md` (no open items; watch `subagent_depth`)
- `docs/editor-research/windsurf/3.4.27.md` (WI-1, WI-8, WI-9, WI-10, WI-11)
- `docs/editor-research/zed/1.11.3.md` (WI-4, WI-6)

## 6) Verification

Run after any implementation work from this plan:

```sh
npm run standards
npm test
npm run build
```
