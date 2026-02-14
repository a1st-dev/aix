---
description: You are generating a **software implementation plan** that will be used by an LLM to generate code.
auto_execution_mode: 1
---

# Rules for Software Planning Output

You are generating a **software implementation plan** that will be used by an LLM to
generate code. Follow this **output contract exactly** and use the required Markdown
structures. Be explicit, exhaustive, and avoid ambiguity.

## Output Contract (Section Order is Mandatory)

1. Title
2. Summary
3. Objectives & Scope
4. Assumptions & Open Questions
5. Requirements
   - Functional Requirements
   - Non-Functional Requirements (performance, security, privacy, accessibility,
     observability, i18n)
6. Architecture & Design Overview (if applicable)
7. Task Grid
8. Task Details (one section per task, in Task ID order)
9. New Code
10. Tests
11. Review Checklist (filled by the model before finishing)

---

## Global Constraints & Style

- Write concrete **step-by-step instructions** for every task
- Use **imperative voice** ("Run… Create… Configure…")
- All commands must be copy-pasteable. Include filenames and paths in code fences.
- Don't invent external facts. If uncertain, move to **Assumptions & Open Questions** and
  propose how to resolve.
- Default to safe, current, stable practices; call out version assumptions
- **Never skip required sections**. If a section is N/A, explicitly state why

---

## 1) Title
`[Project/Feature]: Implementation Plan (v[semver] – [date])`

## 2) Summary
One short paragraph summarizing the goal and outcome.

## 3) Objectives & Scope
- In scope: …
- Out of scope: …

## 4) Assumptions & Open Questions
- Assumptions: …
- Open Questions: …

## 5) Requirements
### Functional
- FR-1: …
### Non-Functional
- NFR-1 (Performance): …
- NFR-2 (Security): …
- NFR-3 (Accessibility): …
- NFR-4 (Observability): …

## 6) Architecture & Design Overview
- High-level diagram description or pseudo-diagram
- Data flow, key interfaces, schemas, external services
- Decisions & trade-offs (link or inline ADR summary)

## 7) Task Grid

> Use `[ ]` for not done and `[✓]` for done. The plan should default to `[ ]` unless
> explicitly marked completed.

| Status | ID | Task | Priority | Depends On | Acceptance Criteria |
|---|---|---|---|---|---|
| [ ] | T-01 | Initialize repo & tooling | M | — | Repo, lint, format, CI bootstrap |
| [ ] | T-02 | Design API schema | H | T-01 | OpenAPI defined, reviewed |
| [ ] | T-03 | Implement service endpoints | H | T-02 | All endpoints pass tests |
| [ ] | T-04 | Write unit & integration tests | H | T-03 | ≥90% lines, critical paths covered |
| [ ] | T-05 | Observability & alerts | M | T-03 | Metrics, logs, SLOs defined |
| [ ] | T-06 | Security review & threat model | Erin | M | T-02 | STRIDE walkthrough, issues filed |

> Optional additional states you may use: `[~]` In Progress, `[?]` Blocked (state reason
> in Task Details).

## 8) Task Details

### T-01 — Initialize repo & tooling
**Goal:** Create reproducible dev environment with lint/format/test on CI.

**Step-by-step instructions:**
1. Create repo `[name]` and default branch `master`
2. Add license `[MIT]`
3. Add `.editorconfig`, `.gitattributes`, and language-specific `.gitignore`
4. Configure package manager `[npm/Cargo]` with lockfile
5. Add linters and formatters (e.g., `eslint`, `cargo fmt`, `cargo clippy`)
6. Create NPM scripts
7. Bootstrap CI (e.g., GitHub Actions) with jobs: `lint`, `test`, `build` on PRs
8. Add minimal README with quickstart
9. Verify by running:
   ```sh
   npm ci && npm run standards && npm run test
   ```

## 9) New Code

Concisely explain what new files, objects, and functions need to exist. Document their
purpose. For files, include the relative path to the file being added or modified.

Use the context-7 MCP or search online for the most up-to-date documentation on the exact
version of relevant libraries, frameworks, etc. used here.

## 10) Tests

Concisely describe tests needed to verify that the new code is correct.

## 11) Review Checklist

[ ] Have all outstanding questions been answered?
[ ] Are there any ambiguities that need to resolved?

## 12) Misc

When I ask: "What questions do you have?", respond with a flat numbered list of questions
for me to respond to, if you have any.
