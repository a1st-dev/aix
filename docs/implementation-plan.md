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

### P1 — Likely bugs or user-visible gaps

- WI-1 (Windsurf): Verify the user-scope hooks path. Devin Desktop docs say
  `~/.codeium/windsurf/hooks.json`; aix writes `~/.windsurf/hooks.json`. If the docs
  are right, fix `packages/core/src/editors/strategies/windsurf/hooks.ts` and
  `packages/schema/src/editor-support.ts`, plus tests.
  Research: `docs/editor-research/windsurf/3.4.27.md`.
- WI-2 (Copilot): Decide the project MCP target. Copilot CLI 1.0.61 auto-loads
  `.github/mcp.json`; aix writes `.mcp.json` with `.github/mcp.json` as an import
  fallback. Confirm whether `.mcp.json` is still read; if not, switch installs to
  `.github/mcp.json` in the Copilot adapter and update the support matrix.
  Research: `docs/editor-research/copilot/1.0.71.md`.

### P2 — Validations and hardening

- WI-3 (Copilot): Ensure generated agent filenames can never start with a dot
  (Copilot 1.0.63 rejects hidden-file agent names). Add a normalization guard/test.
  Research: `docs/editor-research/copilot/1.0.71.md`.
- WI-4 (Zed): Warn when a skill description exceeds 1024 bytes (Zed's documented
  limit; oversized descriptions now warn in Zed 1.7.2).
  Research: `docs/editor-research/zed/1.11.3.md`.
- WI-5 (Claude Code): Document (or warn on) single-segment `dir/**` hook `if:`
  patterns, whose matching semantics changed in 2.1.214.
  Research: `docs/editor-research/claude-code/2.1.215.md`.

### P3 — Verification-only items

- WI-6 (Zed): Confirm `context_servers` remains the on-disk MCP key in Zed settings
  after the 1.10.0 settings-editor consolidation, and confirm `.rules` /
  `~/.config/zed/AGENTS.md` remain documented instruction surfaces (Zed docs were
  unreachable through the research proxy).
- WI-7 (Gemini): Confirm the `.gemini/settings.json` merge preserves unknown keys
  (`coreTools` → `tools.core` migration) and that symlinked skills still load under
  the 0.49.0/0.51.0 symlink hardening.
- WI-8 (Windsurf): Investigate whether Devin Desktop now documents a file-backed
  subagent config (3.3.18 "subagents configurable with default model"); if so,
  consider upgrading Windsurf agents from `unsupported`.
- WI-9 (Windsurf): Consider passing through documented hook fields `show_output` and
  `working_directory`, and skill `permissions:` frontmatter (3.4.22), if portable
  equivalents exist or are added.

### P4 — Repo housekeeping

- WI-10 (Skill): Update `examples/custom/skills/editor-release-research/SKILL.md`
  source hints: Codex changelog moved to `https://learn.chatgpt.com/docs/changelog`;
  Windsurf changelog moved to `https://docs.devin.ai/desktop/changelog`.
- WI-11 (Watch items, no code): Gemini CLI ↔ Antigravity transition (possible future
  rebrand of `.gemini/` paths); Cursor team/workspace customization scopes (currently
  cloud-managed, not file-backed); Windsurf "Devin Desktop" display naming.

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
