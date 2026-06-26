# aix: Editor Integration Update Plan (v1.0.0 – 2026-06-25)

## 2) Summary

This plan outlines the necessary updates to `aix` to align with the latest releases of supported AI editors. The updates include rebranding, adding new hook events, supporting new directory conventions, and exposing new editor-specific settings.

## 3) Objectives & Scope

- In scope:
   - Updating `packages/schema/src/editor-support.ts` with new paths and editor IDs.
   - Updating `packages/schema/src/hooks.ts` with new events.
   - Updating editor-specific strategies in `packages/core/src/editors/strategies/`.
   - Adding new supported editor names for Gemini CLI targets.
- Out of scope:
   - Implementing complex UI features in editors that are not file-backed.
   - Backfilling research for old versions.

## 4) Assumptions & Open Questions

- Assumptions:
   - Existing `windsurf` editor ID should be kept for backward compatibility while adding `devin-desktop`.
   - Plural directory names in OpenCode are preferred over singular.
- Open Questions:
   - Does Cursor's "team" scope have a specific local file convention?
   - Should `aix` actively use the `copilot skill` CLI command or continue managing files directly?

## 5) Requirements

### Functional

- FR-1: Support `devin-desktop` rebrand for Windsurf.
- FR-2: Add `MessageDisplay` hook event for Claude Code.
- FR-3: Support plural subdirectory names in OpenCode.
- FR-4: Add `sublime` and `emacs` as Gemini CLI targets.
- FR-5: Expose new settings like `agent.terminal_init_command` (Zed) and `respondToBashCommands` (Claude Code).

### Non-Functional

- NFR-1 (Performance): Ensure directory discovery remains fast even with plural/singular fallback.
- NFR-2 (Security): Ensure new sandbox settings are correctly mapped to editor-native formats.

## 6) Architecture & Design Overview

The changes will primarily affect the schema definitions and the strategy implementations.

- `editor-support.ts` will be updated to include new metadata.
- `hooks.ts` will include the new `MessageDisplay` event.
- Editor strategies will be updated to handle the mapping of new settings and directory names.

## 7) Task Grid

| Status | ID   | Task                            | Owner | Priority | Depends On | Acceptance Criteria                  |
| ------ | ---- | ------------------------------- | ----- | -------- | ---------- | ------------------------------------ |
| [ ]    | T-01 | Update schema definitions       | Jules | H        | —          | All new events and editors in schema |
| [ ]    | T-02 | Implement Devin Desktop rebrand | Jules | M        | T-01       | `devin-desktop` works as alias       |
| [ ]    | T-03 | Update OpenCode plural paths    | Jules | M        | T-01       | Plural dirs preferred and created    |
| [ ]    | T-04 | Add Claude Code MessageDisplay  | Jules | M        | T-01       | Hook correctly mapped                |
| [ ]    | T-05 | Add new Gemini editor names     | Jules | L        | T-01       | `sublime`, `emacs` supported         |
| [ ]    | T-06 | Update research docs status     | Jules | M        | T-02..T-05 | All research docs updated            |
| [ ]    | T-07 | Verify all changes with tests   | Jules | H        | T-02..T-05 | All tests pass                       |

## 8) Task Details

### T-01 — Update schema definitions

**Goal:** Include new editors, hooks, and settings in the Zod schemas.

**Step-by-step instructions:**

1. Modify `packages/schema/src/editor-support.ts` to add `devin-desktop` to `supportedEditorNames`.
2. Add `sublime` and `emacs` to `supportedEditorNames`.
3. Modify `packages/schema/src/hooks.ts` to add `MessageDisplay` to `HookEvent`.
4. Update `packages/schema/schema.json` by running `npm run build` in the root.

### T-02 — Implement Devin Desktop rebrand

**Goal:** Update Windsurf strategy to handle the new name.

**Step-by-step instructions:**

1. Update `packages/core/src/editors/strategies/windsurf/` to handle `devin-desktop` as an ID.
2. Ensure path discovery checks for `.devin` or equivalent if documented (currently mostly rebrand of name).

### T-03 — Update OpenCode plural paths

**Goal:** Support `agents/`, `commands/`, etc. for OpenCode.

**Step-by-step instructions:**

1. Update OpenCode strategy to use plural directory names for new projects.
2. Maintain fallback to singular names for discovery.

### T-06 — Update research docs status

**Goal:** Close the loop by updating research documents with implementation results.

**Step-by-step instructions:**

1. For each newly created research document in `docs/editor-research/`:
2. Update the `aix status` bullets to reflect the changes made in tasks T-02 through T-05.
3. State which files were modified to address each change.

### T-07 — Verify all changes with tests

**Goal:** Ensure no regressions and new features work.

**Step-by-step instructions:**

1. Run `npm run build`
2. Run `npm run standards`
3. Run `npm test`

## 9) New Code

- `packages/schema/src/editor-support.ts`: Update `supportedEditorNames` and `editorSupportProfiles`.
- `packages/schema/src/hooks.ts`: Add `MessageDisplay` event.
- `packages/core/src/editors/strategies/`: Update strategies for OpenCode, Windsurf/Devin, and Zed.

## 10) Tests

- Unit tests for schema validation of new events and editors.
- Integration tests for OpenCode plural directory discovery.
- Integration tests for Claude Code hook mapping.

### Manual Verification Plan

1. Run `node packages/cli/bin/run.js list editors` and verify `devin-desktop`, `sublime`, and `emacs` appear.
2. Run an install for OpenCode and verify it creates `agents/` instead of `agent/`.

## 11) Review Checklist

[ ] Have all outstanding questions been answered?
[ ] Are there any ambiguities that need to resolved?
