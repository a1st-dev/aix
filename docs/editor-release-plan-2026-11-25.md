# aix editor integrations: Implementation Plan (v0.10.0 – 2026-11-25)

## Summary

Update aix for Copilot CLI's documented user directory, OpenCode's native v2 MCP format,
and new hook support in Claude Code and Grok. Verify the boundaries of native Antigravity
plugins and the Devin Local integration. The [November research records](editor-research/)
capture the upstream changes and current aix behavior.

## Objectives & scope

- Preserve current project installs, legacy imports, and configuration outside aix's
  managed entries while updating the affected adapters.
- Document release-specific behavior for Codex and any compatibility gaps verified in
  Antigravity and Devin Local.
- Leave editor-owned permission policies, connected-app approvals, and workflow runtime
  features to each editor.

## Assumptions & open questions

- This plan uses aix 0.10.0 as the repository baseline. The audit covers stable public
  release notes newer than the previous editor baselines. For Antigravity's own App,
  CLI, and IDE feeds, the prior November 4 research date supplies the cutoff. The Gemini
  CLI records continue the earlier comparison and do not establish Antigravity behavior.
- OpenCode's 2.4.0 notes and live MCP docs disagree on the default protocol. Check the
  tagged runtime and schema before documenting or writing an explicit setting.
- Grok lists `headers_helper` in the changelog. Confirm the native config shape,
  execution context, and trust behavior before deciding whether to model it.
- Determine which legacy Windsurf files Devin Local loads using the published discovery
  rules and a scratch workspace. Use the same approach to check whether Antigravity
  App and CLI accept aix-managed symlinks and the same native plugin manifests.

## Requirements

### Functional requirements

- FR-1. Resolve Copilot CLI user configuration through its documented active home.
  Keep existing aix-managed configuration importable and removable.
- FR-2. Read OpenCode v1 and native v2 MCP settings and preserve the layout and fields
  of existing files when modifying managed entries.
- FR-3. Round-trip fail-closed hooks in both editors for documented events and action
  types. Add Claude Code's skill-shell event with its version requirement.
- FR-4. Document the scope and precedence of Antigravity and Devin Local
  customizations. Implement only native formats verified through normal entry points.
- FR-5. Update each research record with its resolution, including items resolved
  through existing support, documentation, or a verified editor-owned behavior.

### Non-functional requirements

- NFR-1 (Performance). Use existing parsers and path resolution. Avoid extra network
  calls during normal install and import.
- NFR-2 (Security and privacy). Preserve workspace trust and policy. Keep credentials
  out of tests and diagnostics. Exercise config changes only with a temporary user home.
- NFR-3 (Observability). Report unsupported settings and ambiguous path or format
  conflicts via the existing CLI diagnostics.
- NFR-4 (Accessibility and i18n). Keep diagnostics readable in the terminal and
  existing docs. This work adds no new controls or locale data.

## Architecture & design overview

`ai.json` flows through the schema, editor adapter and feature strategy, then to
the existing file writer and managed-entry tracking. Import reverses the same path.
Resolve file layout or scope at the strategy boundary so portable configuration stays
stable. Make capability documentation reflect independently verified editor discovery,
including cases where the editor supports a feature that aix does not yet manage.

## Task grid

| Status | ID   | Task                              | Priority | Depends on | Acceptance criteria                                         |
| ------ | ---- | --------------------------------- | -------- | ---------- | ----------------------------------------------------------- |
| [ ]    | T-01 | Resolve Copilot user paths        | High     | —          | Active home receives writes and legacy state is recoverable |
| [ ]    | T-02 | Support OpenCode v2 MCP           | High     | —          | Native and legacy files round-trip without losing settings  |
| [ ]    | T-03 | Extend hook mappings              | High     | —          | Supported events and failure policies round-trip            |
| [ ]    | T-04 | Verify Antigravity native formats | Medium   | —          | Verified formats and discovery scope are reflected in aix   |
| [ ]    | T-05 | Verify Devin Local compatibility  | Medium   | —          | Supported paths are documented and verified                 |
| [ ]    | T-06 | Update research and verify        | High     | T-01–T-05  | Every record has a disposition and verification passes      |

## Task details

### T-01 — Resolve Copilot user paths

1. Compare [Copilot 1.0.106](editor-research/copilot/1.0.106.md) and
   [1.0.107](editor-research/copilot/1.0.107.md) with the official CLI home reference.
   Verify paths independently for MCP, hooks, rules, agents, skills, prompt-backed skills,
   plugins, and marketplaces on relevant platforms.
2. Update `packages/core/src/editors/strategies/copilot/paths.ts` and its consumers
   to use the documented active user directory. Keep fallback reads for historical aix
   paths. Check adapter discovery and any direct path construction outside strategies.
3. Define deterministic behavior when both homes have a managed entry. Test install,
   repeated sync, import and remove for the default, override, and legacy locations.
   Keep user-authored data and symlinks intact.
4. Update `packages/schema/src/editor-support.ts` and the user-facing docs.

### T-02 — Support OpenCode v2 MCP

1. Compare [the upgrade notice](editor-research/opencode/1.19.6.md) and
   [2.4.0](editor-research/opencode/2.4.0.md) with the tagged config schema. Verify
   `mcp.servers`, shared and per-server timeouts, OAuth naming, `disabled`, `pool`,
   and `protocol`.
2. Update `packages/core/src/editors/strategies/opencode/mcp.ts` and reuse the existing
   config path and JSONC handling. Detect the layout from existing content. Use v1
   compatibility for new files unless the project has selected a supported v2 layout.
3. Preserve unrelated keys and distinct timeout values during install, add, sync, import,
   and remove. Keep the native representation of fields that cannot be translated
   losslessly and use existing diagnostics for unsupported input.
4. Document the v1-to-v2 plugin API boundary and the scope of any supported pooling
   or protocol options. Cover the scenarios in
   [2.2.6](editor-research/opencode/2.2.6.md) and [2.4.0](editor-research/opencode/2.4.0.md).

### T-03 — Extend hook mappings

1. Read the editor references linked from
   [Claude Code 2.1.328](editor-research/claude-code/2.1.328.md),
   [2.1.329](editor-research/claude-code/2.1.329.md),
   [2.1.332](editor-research/claude-code/2.1.332.md), and
   [Grok 1.0.71](editor-research/grok/1.0.71.md).
2. Give `PreSkillShellCommand` its own portable event in
   `packages/schema/src/hooks.ts`. Map it in
   `packages/core/src/editors/strategies/claude-code/hooks.ts` and document Claude Code
   2.1.332 as the minimum version.
3. Map explicit `fail_closed` values to Claude's `onFailure` and Grok's `failClosed`
   in their respective strategies. Preserve unset options. Warn for events, action types,
   or async hooks where failure handling has no effect. Document the Claude minimum
   versions for command/HTTP (2.1.295) and MCP tool hooks (2.1.328).
4. Verify Claude's full-commit marketplace pin round trip from
   [2.1.325](editor-research/claude-code/2.1.325.md) in the existing marketplace strategy.
   Add documentation for the version floor if the current code already preserves pins.
5. Check the native config contract for `headers_helper` from
   [Grok 1.0.88](editor-research/grok/1.0.88.md). If verified, preserve it only as an
   explicitly supplied editor option. Otherwise record the missing contract in that report.

### T-04 — Verify Antigravity native formats

1. Start with [App 2.30.0](editor-research/antigravity/2.30.0.md) and
   [CLI 1.5.2](editor-research/antigravity/1.5.2.md),
   [1.5.3](editor-research/antigravity/1.5.3.md), and
   [1.5.16](editor-research/antigravity/1.5.16.md). Verify native bundle layouts, plugin
   scope, discovery manifests, activation behavior, and hook working directories.
2. Compare the behavior with
   `packages/core/src/editors/adapters/antigravity.ts` and the shared plugin
   compatibility strategy. Reuse native plugin registration patterns where the
   schema and install semantics match. Preserve existing expanded bundles and avoid
   a migration that loads a hook twice or changes its working directory silently.
3. Record CLI discovery of `~/.agents/skills` as scope-specific compatibility.
   Keep `~/.gemini/config/skills` as the shared App/CLI target. Verify fallback
   imports and the trust behavior of existing skill symlinks.
4. Point future release research at Antigravity's own changelog. Use Gemini CLI
   changes only when supported by Antigravity evidence.

### T-05 — Verify Devin Local compatibility

1. Use [3.15.14](editor-research/windsurf/3.15.14.md) and its configuration reference
   to compare legacy Windsurf discovery with the Devin Local `.devin/` and
   `~/.config/devin/` surfaces. Test each claimed compatibility path with the local agent.
2. Keep the existing `windsurf` selection compatible while documenting the supported
   modes. If a new target is necessary, first record which paths and concepts require
   separate handling in `packages/schema/src/editor-support.ts` and the Windsurf adapter.
3. Verify precedence where the same customization appears in both modes. Document
   which files aix writes and which file discovery the editor itself supplies.

### T-06 — Update research and verify

1. Find the complete set of November 25 records and process each `aix status` entry.

   ```sh
   rg -l '^research_performed_at: "2026-11-25T' docs/editor-research
   ```

2. Add an `## Resolution in aix` section to every result. Match each change in order
   to the code, test, or documentation that addresses it. For supported and no-change
   entries, record the existing behavior or editor ownership and its evidence. For
   records with no changes, record the reviewed release and why it needs no work.
   Update original status bullets if the disposition changes. Keep original sources
   and timestamps. If any item remains open, record the exact unresolved behavior.
3. Document Codex project trust in the site with a reference to
   [0.169.0](editor-research/codex/0.169.0.md). Record that aix leaves the trust
   decision with the operator.
4. Update the support matrix and changelog wherever the implementation changes
   visible behavior. Run the repository checks.

   ```sh
   npm run standards
   npm test
   npm run build
   ```

## New code

Extend the existing strategies and schema files identified in T-01 through T-05.
Keep compatibility logic with the owning adapter. Introduce a native plugin strategy
only if the Antigravity checks establish a distinct supported registration format.
Update the research skill's source hints and the existing site pages alongside the
verified adapter behavior.

## Tests

Use the existing core adapter and CLI integration suites. Exercise a Copilot install
and remove against a temporary home, an OpenCode import and sync against mixed native
and legacy fixtures, and a Claude/Grok hook round trip including unsupported cases.
Use `npm run qa:sandbox` for manual CLI checks and the relevant editor's native
discovery tools to confirm that its client reads the generated files.

## Review checklist

- [x] Each follow-up has an owner in the task grid and a research record.
- [x] Conflicting or incomplete upstream details have explicit verification steps.
- [x] T-06 covers the disposition of every research record.
- [x] The tests cover normal entry points and existing configuration.
