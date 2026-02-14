---
description: Implement a planned change while preventing code duplication
auto_execution_mode: 1
---

# Preventing Code Duplication

This workflow is triggered when adding new files or functions that may share logic with
existing code. The goal is to prevent the accumulation of duplicated code that occurs
during iterative, session-by-session development.

## Why Duplication Happens

When AI agents work iteratively across sessions:

1. Each session solves problems locally without full codebase visibility
2. Similar files get similar solutions copy-pasted or re-invented
3. "Working code" feels complete, so extraction is deferred
4. No single session owns the tech debt; it accumulates silently

## Mandatory Pre-Work Checklist

**Before writing any new function or file**, complete these searches:

### 1. Sibling File Search

If adding a file to a directory with similar files (e.g., `commands/add/new.ts`):

```
# Read ALL sibling files first
find <directory> -name "*.ts" -type f
```

Look for: shared patterns, helper functions, imports from shared utilities.

### 2. Utility Search

Search for existing utilities that might already do what you need.

### 3. Package Boundary Check

If this is a monorepo, ask: "does this logic belong in a shared package (e.g., `core`,
`utils`, `shared`)?"

   * If 2+ consumers exist or are likely → extract to shared package
   * If domain-specific → keep local but check for existing abstractions

### 4. Existing Library Check

Check if the functionality already exists in an existing library or package. Is there a
package/dependency that is already installed in the project that provides this
functionality? If not, is this change significant enough that I should search for one and
recommend it?

Examples: Parsing, validation, formatting.

## Extraction Triggers

Extract to a shared utility **immediately** (not later) when:

1. **You copy-paste** any block of code > 3 lines
2. **You write a pure function** that doesn't depend on local state
3. **You see the same pattern** in a sibling file you just read
4. **The function name is generic** (e.g., `parseURL`, `formatDate`, `validateInput`)

## Post-Work Verification

After completing changes, look for any duplication that you may have introduced.

Example:

```sh
grep -r "<distinctive_pattern>" --include="*.ts" .
```

If you find duplication:

1. Extract to shared utility NOW, not in a follow-up task
2. Update all call sites
3. Delete the duplicated code

## Red Flags to Watch For

Stop and reconsider if you find yourself:

   * Writing a regex that looks like it could be reusable
   * Implementing URL/path parsing logic
   * Writing validation or normalization functions
   * Creating type definitions that mirror existing ones
   * Adding the same import to multiple new files

## Example: The Right Way

**Wrong** (what usually happens):

```
Session 1: Create commands/add/skill.ts with parseGitHubURL()
Session 2: Create commands/add/rule.ts with parseGitHubURL()  // copy-pasted
Session 3: Create commands/add/prompt.ts with parseGitHubURL() // copy-pasted again
```

**Right** (what should happen):

```
Session 1: Create commands/add/skill.ts, notice URL parsing is generic
         → Extract to packages/core/src/url-parsing.ts FIRST
         → Import and use in skill.ts
Session 2: Create commands/add/rule.ts
         → Search finds url-parsing.ts already exists
         → Import and use
Session 3: Same pattern continues
```

**Extract before you duplicate, not after**.
