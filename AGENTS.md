# Agents

## Manual testing

Manual testing must never write to the real user config. `aix` resolves the home directory from
`$AIX_USER_HOME` first, then `$HOME`, then `%USERPROFILE%`, and only then falls back to
`os.homedir()`. Point both `AIX_USER_HOME` and `HOME` at a throwaway directory to isolate a run:

```bash
SANDBOX_HOME="$(mktemp -d)"
AIX_USER_HOME="$SANDBOX_HOME" HOME="$SANDBOX_HOME" node packages/cli/bin/aixd.mjs install
```

* `AIX_USER_HOME` redirects every user-scope path aix reads or writes. `HOME` also keeps the
  CLI's own cache and the git and npm processes aix spawns out of the real home
* `--user-home <dir>` is the per-command form of `AIX_USER_HOME`. Each command prints the
  directory it is using, so check for that line before trusting a run
* Do this for anything that can touch global config: `~/.claude.json`, `~/.claude/settings.json`,
  `~/.gemini/settings.json`, `~/.config/zed/settings.json`, `~/.config/github-copilot/`,
  `~/.codeium/windsurf/mcp_config.json`, `~/.codex/config.toml`, and the `~/.aix/backups/`
  store, where aix copies every file before it changes or deletes it
* User scope is the default for `install`, `add`, `remove`, and `sync`. Running them from this
  repository without the override installs the root `ai.json` into the real editor config
* `npm run qa:sandbox` gives you a scratch project and sets `AIX_USER_HOME`, `HOME`,
  `USERPROFILE`, and XDG directories to its temporary home, including for the generated `aix`
  wrapper
* Automated tests use the shared setup below; do not add per-suite home isolation
* Write to the real user config only when explicitly asked to

Automated tests must run through the package `test` or `test:watch` scripts. They use
`scripts/test-runner.mjs` and the shared `vitest.config.ts`; do not run Vitest directly.
The runner gives each test a temporary home and sets both `HOME` and `USERPROFILE`.
The runner also sets `TMPDIR`, `TMP`, and `TEMP` inside its temporary directory.
On macOS, an OS sandbox restricts writes to that directory and Vite caches, including
writes by child processes and through symlinks. Linux and Windows
CI run on disposable GitHub-hosted machines. Other local platforms fail closed until
an equivalent filesystem sandbox is available. `scripts/test-setup.ts` checks the
sandbox before loading test files. Vitest's `isolate` option does not protect files.

The protection checks in `test-environment.test.ts` exercise a child process with the
real `HOME`, a native shell, and symlink traversal against disposable probe files.

## Deployment

Always create a **signed tag** when tagging a release:

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"
```

Do not use lightweight or unsigned tags. Every release tag must be signed with a GPG key.

### Creating a release

1. Ensure `main` is up to date and includes all release-ready changes.
2. Bump versions in `package.json` and `package-lock.json` files, then commit those changes.

```bash
npm run version:bump -- X.Y.Z
git add package.json package-lock.json packages/*/package.json
git commit -m "chore: release vX.Y.Z"
```

3. Ensure the repo is clean and the bumped version matches the tag you will create (`X.Y.Z` vs `vX.Y.Z`).
4. Run the local verification suite before tagging:

```bash
npm ci
npm run standards
npm test
npm run build
```

5. Create a signed release tag (required):

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"
```

6. Push the commit and the tag:

```bash
git push origin main
git push origin vX.Y.Z
```

Pushing a `v*` tag triggers the GitHub release workflow, which publishes packages and creates the GitHub Release.

<!-- BEGIN AIX MANAGED SECTION — DO NOT EDIT -->
## general

## Core Principles

* Do deep research to find libraries (NPM, GitHub, Cargo, etc.) that solve problems
  instead of writing code
   * Write new code only as a last resort
* Separate formatting-only changes from functional changes
* Be critical and thorough. Prefer truth and direct feedback over politeness
* Look around and use existing patterns and code when possible. Look for:
   * Similar components and use their patterns
   * Library code you can reuse
   * Existing dependencies from package.json or Cargo.toml that you should use
* ALWAYS ask yourself: Can I make this a reusable function/component?
* Always consider the developer experience:
   * Am I placing a burden on the developer with this change?
   * Is it as easy to use / execute / import / configure as possible?
* When making _any_ changes:
   * Consider the impact on other parts of the codebase
      * What tests, documentation, etc. needs to be updated?
      * Search for other files that should be changed after what you just did
   * How has the context changed now that I've made this change?
      * Should I refactor the code to introduce an abstraction to make it more
         maintainable?
      * Should I delete anything that's now unused?
* Check your work after you finish a task:
   * Did I address everything I was asked to?
   * Run `npm run standards` (or `tsc` / `eslint` / `commitlint` / `markdownlint` /
      `cargo lint-clippy && cargo lint-fmt` as appropriate)
   * Test any change to behavior by:
      * Running the tests
      * Running the app and manually testing the changes (Tauri MCP/CLI or Playwright MCP/CLI)

## Naming Conventions

* PascalCase for classes
* camelCase for variables, instance functions, and methods
* snake_case for static functions
* kebab-case for file and directory names
* UPPERCASE for environment variables
* Files exporting classes: PascalCase.js (e.g., `User.ts`)
* Files exporting functions/objects: kebab-case.js (e.g., `my-function.ts`)
* Tests: `ClassTheyAreTesting.test.ts`
* Avoid magic numbers and define constants
* Do not export a type alias that is used once inside its own file

## Formatting Rules

* **3 spaces** (never tabs)
* One blank line between unrelated statements

## Control Structures

* Avoid deep nesting (keep low cyclomatic complexity)
* Most common case in first `if`
* Positive logic over negative e.g. `if (isToday)` vs `if (!isFuture && !isPast)`
* Break complex conditions into variables/functions
* Check error conditions early with early returns
* Ternary operator only for simple conditions

## Variable Best Practices

* Declare in lowest possible scope
* Declare at top of scope before statements
* Avoid modifying input parameters (except immediate sanitization)
* Always sanitize user input
* Prefer immutability (`readonly`, `as const`, `const`)

## Documentation

* Use en-US spelling and grammar, not British.
* No useless comments e.g. do not add `/** Creates the foo */` to `createFoo()`
   * Only add a comment if:
      * The code's rationale is not obvious from naming/context
      * The comment answers "why," NOT "what" or "how"
   * Do not write a comment that references how the code changed from a previous 
     version
* Be concise and use concrete, common, specific technical terms
* Do not comment on types, parameters, or usage that are clear from code or naming
* Use ASCII in comments, never unicode symbols
* No commented-out code

## front-end

## Layout Thrashing

Common causes:

- Reading a layout property forces a synchronous layout. offsetWidth, offsetHeight,
  offsetTop, clientWidth, scrollTop, scrollHeight, getBoundingClientRect(),
  getComputedStyle(), innerText, and focus(), and others.
- Alternating reads and writes in a loop is one case. For example, el.style.width =
  el.offsetWidth + 10 + 'px' inside a forEach runs one layout per item.
- A Vue watch or onUpdated that measures the DOM, writes, and then triggers another
  update.
- Measuring each row in a list component
- Calling a third-party positioning library on every frame

How to avoid it

- Do all reads first, then do all writes.
- Put DOM writes in requestAnimationFrame, and do reads before the frame or right after a
  write batch
- Cache measured values. Do not measure the same element again in the same frame.
- Use ResizeObserver and IntersectionObserver instead of measuring in scroll or resize
  handlers. In Vue, use useResizeObserver, useElementSize, and useIntersectionObserver. Or
  better yet, find a solution that does not require JavaScript. Consider progressive
  enhancement for non-essential features that involve CSS features outside of our
  browerserslist range and that would degrade gracefully.
- Animate transform and opacity only. Do not animate top, left, width, height, or margin,
  because those trigger layout on every frame.
- Change one class instead of setting several style properties one at a time.
- Build large DOM changes off-document, for example in a DocumentFragment, then insert
  them once.
- Use contain: layout or content-visibility: auto to limit how far a layout change
  spreads.
- Mark scroll and touch listeners { passive: true }, and throttle them to one run per
  frame.

How to find it

- In the Chrome DevTools Performance panel, look for purple "Layout" blocks with a "Forced
  reflow" warning, or the "Recalculate Style" then "Layout" pattern repeated inside one
  task.

## css-scss

* Always use SCSS, not CSS
* If using a component library, use existing components, props or built-in options over
  custom styling
   * Prefer pre-existing utility classes over custom styling
* Consider adding a custom utility class to the global SCSS if a pattern is used in
  multiple places (e.g. text truncation, screen reader text, grid patterns)
* Use CSS logical properties: `margin-inline-start`, not `margin-left`;
  `text-align: start`, not `text-align: left`
* Use CSS variables for theme-able values

## ABSOLUTELY DO NOT

* DO NOT use `@extend`
* DO NOT override `line-height` to values other than `1` unless you have a very good
  reason

## SCSS API

If the project auto-injects SCSS namespaces via its build config (e.g. Vite's
`css.preprocessorOptions`), prefer using the mixins/vars/functions from those libraries
over hard-coded values. Check the project's `vite.config.ts` or equivalent to see what is
available.

## Style Block Structure

Vue components have **two** optional `<style>` blocks:

   1. A **non-scoped** block for CSS custom property (theme variable) definitions
   2. A **scoped** block for all component-specific styling

## Theming

### CSS custom property naming

Follow a consistent naming pattern for theme variables:

```text
--<namespace>-<component>-<property>
--<namespace>-<component>-<subComponentOrVariant>-<property>--<state>
```

Examples: `--button-fill-color`, `--button-fill-bgColor--hover`,
`--toggle-bgColor--active`, `--chip-borderColor--selected`

If the project uses a namespace prefix (e.g. `app-`), include it:
`--app-button-fill-color`, `--app-toggle-bgColor--active`

### Theme layers

When supporting light/dark mode with explicit theme classes, define variables in three
places for full coverage:

   1. `:root, .theme--light { ... }` — light mode (explicit opt-in and default)
   2. `.theme--dark { ... }` — dark mode (explicit opt-in)
   3. `@media (prefers-color-scheme: dark) { :root:not(.theme--light) { ... } }` —
      system-preference dark mode

## Naming Conventions (BEM-like with SCSS)

   * **Block**: the component root class, matching the component name in camelCase (e.g.
     `.card`, `.progressBar`, `.toggle`). Projects may use a namespace prefix (e.g.
     `.app-card`)
   * **Element**: hyphen-separated from the block (e.g. `.card-body`, `.card-title`,
     `.button-label`)
   * **Modifier**: double-hyphen suffix (e.g. `.button--disabled`,
     `.card--layout-horizontal`, `.chip--selected`)

Use SCSS `&` nesting to compose these:

```scss
.card {
   &-body {
      &-primaryArea { /* .card-body-primaryArea */ }
   }
   &--disabled { /* .card--disabled */ }
}
```

### Exported CSS classes

When a component exposes slots that consumers may fill with custom content, export a
frozen object of CSS class names so consumers can apply the same styling:

```ts
export const cardCSSClasses = Object.freeze({
   cardPrimaryArea: 'card-body-primaryArea',
   cardTitle: 'card-title',
});
```

Pass these to slots via `v-bind`:

```vue
<slot name="title" v-bind="{ title, className: cardCSSClasses.cardTitle }" />
```

Limit exported class names to those required for styling slotted content or test
assertions.

## Property Ordering

```scss
.className {
   // Positioning
   position: absolute;
   z-index: 1;
   top: 0;
   inset-inline-end: 0;

   // Display / box model
   display: inline-block;
   overflow: hidden;
   width: 100px;
   padding: 10px;
   border-style: solid;
   margin: 10px;

   // Color
   background: #000000;
   color: #ffffff;

   // Text
   font-family: sans-serif;
   font-size: 16px;
   line-height: 1.4;
   text-align: right;

   // Everything else
   cursor: pointer;
}
```

## Scoped Style Patterns

### `:deep()`

Use `:deep()` to style slotted or child-component content from a scoped parent:

```scss
:deep(.card-title) { font-weight: 400; }
:deep(> .icon) { flex-shrink: 0; }
```

### `v-bind()` in CSS

Vue's `v-bind()` can reference reactive values from `<script setup>` in `<style scoped>`
blocks:

```ts
const aspectRatio = ref('16 / 9');
```

```scss
.thumbnail {
   aspect-ratio: v-bind(aspectRatio);
}
```

## Responsive Design

   * No fixed pixel breakpoints. Components should rely on Flexbox, CSS Grid, and
     container-relative sizing
   * Use `@media (hover: hover)` or a project-provided hover mixin when giving a
     component hover styles that should not show on touch-only devices
   * Use `prefers-reduced-motion: reduce` to disable animations where appropriate
   * Consider whether a component's text should be user-selectable. Use
     `user-select: none` for button-like interactive elements

## SCSS Syntax

   * Use `@use` and `@forward`. Do not use `@import`
   * Use `sass:map`, `sass:list`, etc. via `@use 'sass:map' as map;`
   * Prefer the modern Dart Sass compiler API (`api: 'modern-compiler'` in Vite config)
   * CSS Modules (`.module.scss`) should only be used for demo/story styling, not in
     library components. Use `:global()` within a module file to target third-party
     data attributes

## do-not

* ABSOLUTELY DO NOT ignore "pre-existing" TypeScript or linting errors, failing tests, or
  out of date documentation. If you see them, fix them before proceeding
* ABSOLUTELY DO NOT use `@deprecated` on anything unless you are explicitly asked to.
  Always fully refactor and delete old code as-needed instead of deprecating it
* ABSOLUTELY DO NOT implement functionality that already exists in a library or package,
  especially if that package is already installed in the project. Examples: parsing,
  validation, formatting
* ABSOLUTELY DO NOT disable linting rules (ESLint, oxlint, clippy, etc.) in the config to
  get around linting errors. Fix the underlying issues
* ABSOLUTELY DO NOT instruct me to do things like "run the dev server and test it out,"
  "run the tests," "install this module", or anything else that you can do yourself as
  part of the task

## git

Refer to this when running git commands:

   * https://raw.githubusercontent.com/silvermine/silvermine-info/refs/heads/master/commit-history.md
   * https://raw.githubusercontent.com/silvermine/standardization/refs/heads/master/commitlint.js

## ABSOLUTELY DO NOT

* ABSOLUTELY DO NOT `git push` without express permission

## Commit Message Format

Commits must follow the Conventional Commits specification:

```text
<type>(<scope>): <subject> (#issue)

[optional body]

[optional footer]
```

## Type (Required)

   * `feat:` — New feature
   * `fix:` — Bug fix
   * `docs:` — Documentation changes
   * `style:` — Code style changes (formatting, white-space, etc.)
   * `refactor:` — Code refactoring without behavior changes
   * `perf:` — Performance improvements
   * `test:` — Adding or updating tests
   * `build:` — Changes to build system or dependencies
   * `ci:` — CI/CD configuration changes
   * `chore:` — Maintenance tasks
   * `config:` — Configuration changes
   * `revert:` — Revert a previous commit

# Scoped Commits

These are the ONLY two kinds fo scoped commits allowed

* `sub(feat):` — Sub-commit of a larger feature
* `sub(fix):` — Sub-commit of a larger fix

## Subject Line

* **72 characters maximum** for the full header (type + scope + subject + issue)
* Use imperative mood ("add feature" not "added feature" or "adds feature")
* Lowercase start (except proper nouns)
* Do not end with a period
* Include issue number in format `(#xxxxx)` at the end
* If multiple issues, include additional numbers in the body/footer instead
* Describe **what** the commit does, not what was wrong

## Body

* Separate from subject with a blank line
* **90 characters maximum** per line
* Explain **why** — but only if the subject doesn't fully explain the commit on its own
* Bodies are discouraged for simple commits. Only add a body when you have a reason to
  explain why the change was made
* Describe the outcome or behavior change, not how the code does it
* Prefer plain language over technical jargon
* Use markdown formatting for lists

## Footer

* Blank line before footer
* Breaking changes: start with `BREAKING CHANGE:` (case-sensitive)
* Extra ticket references: `Closes #123`, `Fixes #456`

## Commit Content

* Each commit is a cohesive unit of work — independently reviewable
* No "fix review stuff" commits — squash/rebase into the original commits
* Renames/moves in separate commits from content changes
* Import updates can be included with file moves

## Examples

Subject-only (preferred):

```text
fix: handle expired tokens in auth refresh flow (#12345)
```

With body (only when needed):

```text
refactor: replace API request queue with streaming pipeline

The queue-based approach caused memory pressure under high concurrency
because it buffered entire responses before forwarding.
```

## mcps

* If you make UI changes, use MCP tools to test them in a real environment
   * Use the Tauri MCP when working within a Tauri app. Use agent-device for anything the
     Tauri MCP can't do
   * Use or browser-use for other projects
* Use the fallow MCP in a TypeScript or JavaScript project before deleting an export, a
  file, or a dependency, and before opening an MR. `trace_export` and `impact_closure`
  list the consumers, `audit` reads the changed files, and `inspect_target` gathers the
  evidence for one file or symbol in a single call

## npm

* Always use `npm` instead of `pnpm` or `yarn`
* Always use the `--save-exact` flag when installing a dependency
* Use the `-y` flag with `npx` when running a command
* Use project-defined `npm` scripts instead of equivalent CLI commands
* ABSOLUTELY DO NOT introduce new dependencies without verifying the license is
  admissible (see dependency-licenses.md)
* To install dependencies in a folder that already has `node_modules`, run
  `npm ci --dry-run && npm i --no-save`. `npm ci --dry-run` exits 1 when
  `package.json` and `package-lock.json` disagree. `npm i --no-save` then installs the
  locked versions, keeps `node_modules`, and does not write either file. Use plain
  `npm ci` only when `node_modules` does not exist or a package in it is damaged

## rust

Standard Rust version and edition:

   * Version: **`1.89.0`**
   * Edition: **`2024`**

## Code Standards

Follow the Rust community's default linting and formatting standards as defined by
`clippy` and `rustfmt`, with these exceptions:

```toml
# rustfmt.toml
tab_spaces = 3
hard_tabs = false
newline_style = "Unix"
remove_nested_parens = false
use_field_init_shorthand = true
use_try_shorthand = true
```

## Error Handling

Use `thiserror` crate to define error types. If there are only a few error types, or
you do not need serializable errors, you may define an error enum without using
`thiserror`.

For Tauri projects, see Tauri's error handling suggestion.

## Documentation

* All Rust libraries/crates should have well-structured documentation available via `cargo
  doc --open`
* Follow the Rust documentation guidelines:
   * https://doc.rust-lang.org/rust-by-example/meta/doc.html
   * https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html
* Ensure the home page of generated docs explains the crate's purpose and usage
* Do not inline README.md into crate docs if it contains developer-only instructions. Use
  module-level `//!` comments or a separate `DEVELOPERS.md` instead
* For applications: add doc blocks to commonly-used modules, structs, enums, and functions
* **Always set code examples in doc blocks to `no_run`** to prevent `cargo test` from
  executing them

## Project Configuration Checklist

* `rust-toolchain.toml` file in the root
* `.cargo/config.toml` file with lint and fix aliases
* `Cargo.toml` with the standard edition and rust-version
* `rustfmt.toml` with the settings above
* Up-to-date README with linting and fixing instructions

### Toolchain Configuration

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.88.0"
components = [
   "rustfmt",
   "clippy"
]
```

### Linting Commands

```sh
# Check
cargo clippy --all-targets --all-features -- -D warnings && cargo fmt -- --check

# Fix
cargo clippy --all-targets --all-features --fix && cargo fmt
```

### Cargo Linting Aliases

```toml
# .cargo/config.toml
[alias]
lint-clippy = "clippy --all-targets --all-features -- -D warnings"
fix-clippy = "clippy --fix"
lint-fmt = "fmt -- --check"
fix-fmt = "fmt"
```

For projects with JavaScript/TypeScript, add `rust:lint` to `npm run standards`:

```json
{
   "scripts": {
      "rust:lint": "cargo lint-clippy && cargo lint-fmt",
      "rust:lint:fix": "cargo fix-clippy && cargo fix-fmt",
      "standards": "npm run rust:lint"
   }
}
```

### Cargo.toml Requirements

* `[package] name`, `description`, `version` (semver, start at `0.1.0`)
* `[package] edition` — use the standard edition
* `[package] rust-version` — match `rust-toolchain.toml`

### Dependencies

* Always pin to exact semver versions. No caret, tilde, wildcard, or comparison
 requirements
* When using `git` dependencies, specify a tag or hash, not a branch
* Do not introduce new dependencies not used in other Silvermine projects without
 consulting the team

## Tests

* Unit tests in the same file as the code
* Integration tests in a `tests` folder sibling to `src`
* Do not write documentation tests. Always annotate code in doc blocks with `no_run`

## tauri

* Assume Rust code must compile and run on Android, iOS, and Windows in addition to
  macOS/Linux. This applies to both Tauri projects and pure Rust crates.
* Account for platform differences, especially:
   * C library bindings (for example SQLite ABI, pointer sizes, and calling conventions)
   * Conditional compilation (`#[cfg(target_os = ...)]`) when platform-specific behavior
     is unavoidable
   * File path handling (use `std::path::Path`, not string manipulation)
   * Platform-specific dependencies and feature flags in `Cargo.toml`
* When introducing or modifying FFI/unsafe code, verify that types and assumptions hold
  across all target platforms, especially 32-bit Android ARM versus 64-bit desktop.

## testing

* ALWAYS be very careful to only write test that are absolutely necessary and  
  that provably test a practical scenario. Do not over-specify or write too
  many tests.
* Prefer practical e2e tests over unit tests. Use unit tests for critical
  functionality or complex logic
* Always run the tests you write
* Group related tests with `describe()` blocks
* Add blank line before `expect` / assertion statements
* Follow the Arrange-Act-Assert pattern
* Do NOT use `.to.be.true` or `.to.be.false`. Use `.to.strictlyEqual(true)` or
  `.to.strictlyEqual(false)` instead
* Use `.to.eql()` for deep equality comparisons

## typescript-javascript

Follow these standards:

* https://github.com/silvermine/silvermine-info/raw/refs/heads/master/coding-standards/typescript.md
* https://raw.githubusercontent.com/silvermine/silvermine-info/refs/heads/master/coding-standards.md

## Core Principles

* Prefer `const` for immutable variables
* Group consecutive declarations in one statement; avoid separate `const` for simple,
  related assignments
* Use template literals when they improve readability; avoid multi-line template literals
* Use `String()` for explicit string conversion
* Prefer `async/await` over Promise chaining
* Always wrap comments to use the full line length
* Code must be 140 characters or less; comments must be 91 characters or less

## ABSOLUTELY DO NOT

* ABSOLUTELY DO NOT use `any` in TypeScript code
* ABSOLUTELY DO NOT use `as` typecasts to fix type narrowing issues; use or implement
  proper type guard functions instead
* ABSOLUTELY DO NOT use `do-while` loops, `for-in` loops, nested ternary operators, or
  multiline template literals

## Style

BAD: DO NOT DO THIS
```typescript
const a = 1;

const b = 2;

const c = 3;
```

GOOD:
```typescript
const a = 1,
      b = 2,
      c = 3;
```

## Naming Conventions

* See general Silvermine coding standards
* Avoid magic numbers and define constants
* Use `memo` as the accumulator in reduce functions
* Acronyms: ALL_CAPS except when first letter of camelCase property
   * Good: `id`, `assetID`, `lank`, `contentLANK`, `getAWSRole`
   * Bad: `assetId`, `contentLank`, `getAwsRole`
* Function naming:
   * Return single value: `get` + column name
   * Return single record: `get` + table name
   * Return multiple rows: `list` + table name
   * No return: strong verb + noun
   * Boolean: start with "is" (e.g., `isPublished`)

## Functions & Logic

* Use higher-order functions (map, filter, reduce) to simplify logic
* Arrow function parameters must have parentheses and explicit returns (good: `(a) => {
  return value; }`, bad: `a => a.value`)
* No implicit returns in arrow functions; no arrow functions as class properties
* Use arrow functions for simple cases (<3 instructions), named functions otherwise
* Use default parameter values instead of null/undefined checks
* Use RO-RO (Receive Object, Return Object) for passing and returning multiple parameters
* Use rest parameters instead of `arguments`
* Point-free style: when a callback is a direct function reference, pass it
  directly (good: `rules.map(lankFromRule)`, bad: `rules.map((rule) => { return
  lankFromRule(rule); })`)

## Destructuring

* Basic object/array destructuring: yes
* Array destructuring with rest: yes
* Object destructuring with rest: avoid
* Array destructuring with ignores: use with caution
* Renaming while destructuring: yes
* Deep data destructuring: avoid (not readable)

## Types (TypeScript)

* Explicit types for exported variables
* Explicit return types for functions
* Use primitive types (`string`, `number`, `boolean`)
* No space between variable and colon; one space between colon and type
* Reuse existing type definitions (e.g., Zod-inferred types) rather than duplicating
* Never use `as` casts to fix type narrowing issues; use proper type guards

## TypeScript Features

* Rest parameters: yes
* Spread operator: yes
* Default parameters: yes
* Iterators and generators: use with caution
* Parameter properties: yes (private only)

## Data Handling

* Avoid excessive use of primitive types; encapsulate data in composite types
* Prefer immutability:
   * Use `readonly` for immutable properties
   * Use `as const` for literals that never change

## Error Handling

* Prefer `instanceof` for error checking

## Imports

* If a `process.env` value must be set before an import, place the assignment at the top
  of the file, before imports
* When `process.env` values come from CLI args: import arg parser first, parse args,
  assign `process.env`, then import everything else

## vue

Assume Vue 3.5+ with the Composition API and Single-File Components (SFCs) unless
`package.json` indicates otherwise.

* ABSOLUTELY DO NOT use with unsanitized inputs `v-html` in Vue templates

## SFC Structure

Follow this block order:

   1. `<template>`
   2. `<script lang="ts">` — type/interface exports and constants (no `setup`)
   3. `<script setup lang="ts">` — component logic
   4. `<style lang="scss">` — global (non-scoped) CSS variables for theme support
   5. `<style lang="scss" scoped>` — scoped component styles

The dual `<script>` block pattern ensures TypeScript interfaces and exported constants are
available to consumers without requiring `<script setup>`.

```vue
<template>
   <div class="myComponent">
      <slot />
   </div>
</template>

<script lang="ts">
export interface MyComponentProps {
   label: string;
}
</script>

<script setup lang="ts">
const props = defineProps<MyComponentProps>();
</script>

<style lang="scss">
/* theme variables (non-scoped so theme switching works globally) */
</style>

<style lang="scss" scoped>
/* component styles */
</style>
```

Usage:

```ts
import { MyComponentProps }, MyComponent from './MyComponent.vue';
```

## Props

Define a TypeScript interface in the non-setup `<script>` block and reference it with
`defineProps<T>()`:

```vue
<script lang="ts">
export interface ButtonProps {
   disabled?: boolean;
   appearance?: 'subdued' | 'link' | 'outline' | 'fill';
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<ButtonProps>(), {
   disabled: false,
   appearance: 'subdued',
});
</script>
```

### Discriminated union props

When a component has mutually-exclusive prop combinations, define separate interfaces and
combine them with a union type. Use `never` to exclude invalid combinations:

```ts
export interface IconOnlyButtonProps extends BaseButtonProps {
   icon: IconName;
   label?: never;
   ariaLabel: string; // Required when no visible label
}

export interface LabelOnlyButtonProps extends BaseButtonProps {
   icon?: never;
   label: string;
   ariaLabel?: string;
}

export type ButtonProps = IconOnlyButtonProps | LabelOnlyButtonProps;
```

### `defineModel`

For v-model bindings, use `defineModel`

```ts
const modelValue = defineModel<boolean>({ default: false });
```

In the template:

```vue
<SwitchRoot v-model="modelValue" />
```

## Emits

Unlike props and slots interfaces, emits may be defined inline:

```ts
defineEmits<{
   'update:selected': [value: boolean];
   select: [event: Event];
}>();
```

## Slots

Define slot types in the non-setup `<script>` block and register them with `defineSlots`:

```vue
<script lang="ts">
export interface CardSlots {
   default?: never;
   actions?: () => unknown;
   title?: (props: { title: string; className: string }) => unknown;
}
</script>

<script setup lang="ts">
defineSlots<CardSlots>();
</script>
```

Pass CSS classes and internal state to slot consumers via `v-bind`:

```vue
<slot v-bind="{ cssClasses: buttonCSSClasses }">
   <!-- default content -->
</slot>

<slot name="title" v-bind="{ title, className: cardCSSClasses.cardTitle, id: titleID }">
   <h3 :id="titleID" :class="cardCSSClasses.cardTitle">{{ title }}</h3>
</slot>
```

Use `useSlots()` or `$slots` to conditionally render wrapper elements:

```ts
const slots = useSlots();
```

```vue
<div v-if="$slots.actions" class="card-actions">
   <slot name="actions" />
</div>
```

## VueUse

Use `@vueuse/core` (and `@vueuse/components` if installed) instead of raw browser APIs.
VueUse composables handle lifecycle cleanup automatically and are SSR-safe.

| Instead of | Use |
| --- | --- |
| `addEventListener` / `removeEventListener` | `useEventListener()` |
| `setTimeout` / `clearTimeout` | `useTimeoutFn()` |
| `setInterval` / `clearInterval` | `useIntervalFn()` |
| `new ResizeObserver()` | `useResizeObserver()` |
| `new IntersectionObserver()` | `useIntersectionObserver()` |
| `window.matchMedia()` | `useMediaQuery()` |
| Manual scroll position tracking | `useScroll()` |
| `lodash.debounce` / hand-rolled debounce | `useDebounceFn()` |
| `getComputedStyle` / manual CSS var reads | `useCssVar()` |

Other commonly used composables: `onClickOutside()`, `useElementSize()`, `useFocusTrap()`,
`useVModel()`.

## Template Refs

Use `useTemplateRef` (Vue 3.5+):

```ts
const thumbnail = useTemplateRef<typeof Thumbnail>('thumbnail');
```

## Component Composition

Use `<component :is="...">` to switch between element types based on props:

```ts
const elementType = computed(() => {
   return props.href ? 'a' : 'button';
});
```

```vue
<component :is="elementType" v-bind="attrs">
   <slot />
</component>
```

If using a headless component library (e.g. Reka UI, Radix Vue), consider its
`<Primitive>` component for root-level elements — it provides `asChild` for composability
without extra wrapper elements in the DOM.

### `inheritAttrs`

When a component needs manual control over where `$attrs` are applied, disable automatic
attribute inheritance and spread attrs explicitly:

```ts
defineOptions({ inheritAttrs: false });
```

```vue
<template>
   <div>
      <button v-bind="{ ...$attrs, onClick: undefined }" />
   </div>
</template>
```

## Exports

### Component index

Every component should be exported from the component index with both a named default
export and a wildcard re-export (for types):

```ts
export * from './Button.vue';
export { default as Button } from './Button.vue';
```

### Type exports

Export all public interfaces, type aliases, and constants from the non-setup `<script>`
block so consumers can import them alongside the component.

## Accessibility

* All interactive components must have appropriate ARIA attributes (`role`, `aria-label`,
   `aria-pressed`, `aria-disabled`, `tabindex`, etc.)
* Icon-only buttons require an `ariaLabel` prop (enforce at type level with discriminated
   unions)
* Use `<label for>` associations for form controls, or `aria-labelledby` when the label
   lives outside the component
* Screen-reader-only content uses a `.sr-only` utility class
* Support keyboard interaction (`@keydown.enter`, `@keydown.space`) alongside click
   handlers

## Server-Side Rendering (SSR)

If the component library must render in both browser and Node.js environments:

* Do not access `window`, `document`, `navigator`, or other browser globals at the top
   level of `<script setup>`. Access them inside `onMounted` or after a
   `typeof window !== 'undefined'` check
* Prefer VueUse composables (SSR-safe by default)
* All custom directives must implement the `getSSRProps` hook so Vue's SSR renderer can
   produce correct attributes without mounting the directive in a DOM:

```ts
export const vMyDirective = {
   beforeMount(el, binding) {
      el.setAttribute('data-x', binding.value);
   },
   getSSRProps(binding) {
      return { 'data-x': binding.value };
   },
} satisfies ObjectDirective;
```

## Template Format

```vue
<ComponentName :prop-1="value" :prop-2="value" :long-prop-name="value" @event="handler">
</ComponentName>
```

## Browser Support

* Run `npx -y browserslist` to see the supported browser list if it's not documented

## writing

If you do not already have the Plain English output style in your context, read this file:
@../output-styles/plain-english.md

<!-- vale plain-english.vague = NO -->
Avoid metaphors, figures of speech, and vague words like "carries", "holds" or "names".
<!-- vale plain-english.vague = YES -->

Use specific, common technical terms.

# Dependency License Policy

Dependencies must be licensed under one of the following licenses, or a license that is
equally permissive:

* 0BSD
* AFL-2.1
* Apache-2.0
* BSD-2-Clause
* BSD-3-Clause
* ISC
* MIT
* Python-2.0
* Unlicense
* WTFPL

## Rules

* **Do not recommend or add** any dependency whose license is not on the admissible list
  above (or equally permissive)
* **Verify the license** of a dependency before recommending or installing it
* If an **existing dependency** is discovered to be licensed under a non-admissible
  license, **immediately flag it** to the developer before proceeding with any other work
* Copyleft licenses (e.g., GPL, LGPL, MPL, AGPL, EUPL, SSPL, BSL) and non-commercial or
  source-available licenses are **not admissible**
* When in doubt about whether a license is "equally permissive," flag it to the developer
  for a decision rather than assuming it is acceptable

## libraries

Use these by default:

* Vue / Vue Router / Pinia
* Vite 8+
* Vitest
   * Vitest Browser + Playwright if applicable to project
* TypeScript 6+
* oxlint / oxfmt
* NPM
* https://github.com/guidepup/guidepup for screenreader testing

## markdown

Always use `*` for unordered lists instead of `-`

Include a newline before and after the list

Always include a tag to specify the language, even if it's `txt`

Run `npm run standards` if available to lint with `markdownlint`

## sql

* Readability and clarity through vertical alignment
* Explicit column names (never `SELECT *`)
* Consistent formatting and indentation

## Formatting Rules

* **Vertically align** sibling elements of queries
* **Indent** new lines in statements
* **Start new lines with commas** when splitting comma-delimited text
* **Break lines at keywords** (JOIN, WHERE, AND, OR)
* **Terminate statements** with semicolon on new line

```sql
SELECT u.userID
     , u.firstName
     , u.lastName
     , p.profileImageUrl
  FROM Users u
  JOIN UserProfiles p
    ON u.userID = p.userID
 WHERE u.isActive = 1
   AND u.createdDate >= '2023-01-01'
ORDER BY u.lastName
        , u.firstName
;
```

### Alignment Pattern Quick Reference

```sql
SELECT column1          -- SELECT keyword left-aligned
     , column2          -- Columns aligned with comma-first
     , column3
  FROM TableName t      -- FROM indented 2 spaces
  JOIN OtherTable o     -- JOIN aligned with FROM
    ON t.id = o.id      -- ON conditions indented from JOIN
   AND t.active = 1     -- Additional conditions aligned with ON
 WHERE t.status = 1     -- WHERE aligned with FROM/JOIN
   AND t.date > '2023'  -- Additional conditions aligned
ORDER BY column1        -- ORDER BY aligned with FROM/JOIN/WHERE
        , column2       -- Order columns aligned
;                       -- Semicolon on new line
```

## Naming

* **UPPERCASE**: SQL keywords, functions (SELECT, FROM, WHERE, COUNT)
* **PascalCase**: Table and view names, plural form (e.g., `Users`, `UserProfiles`)
* **camelCase**: Column names (e.g., `userID`, `firstName`, `emailAddress`)
* **Capitalize "ID"** suffix (e.g., `userID`, not `userId`)
* **Aliases**: Short but clear; one/two letters for simple cases (e.g., `u`, `p`),
  descriptive abbreviations for complex queries

## Query Structure

### SELECT Statements

* List columns in logical order: IDs first, descriptive fields, then dates
* Use explicit column names (never `SELECT *`)
* Group related columns together

### JOIN Clauses

* Use explicit JOIN syntax (INNER JOIN, LEFT JOIN, etc.)
* Align ON conditions with JOIN keyword
* Use parentheses for complex join conditions

### WHERE Clauses

* Each condition on its own line for complex queries
* Use parentheses to clarify order of operations
* Group related conditions together

## Performance Guidelines

### Indexing

* Create indexes for columns in WHERE and JOIN clauses
* Create composite indexes for multi-column queries
* Consider maintenance cost on frequently-updated tables

### Query Optimization

* Use **EXISTS** instead of IN for subqueries checking existence
* Limit result sets with appropriate WHERE conditions
* Use LIMIT when only a subset is needed
* Use `EXPLAIN QUERY PLAN` to verify index usage

## DDL

### Table Creation

* Define primary keys explicitly
* Use appropriate data types
* Include NOT NULL constraints where appropriate
* Add meaningful default values
* Define foreign key relationships explicitly

```sql
CREATE TABLE Users (
   userID INTEGER PRIMARY KEY AUTOINCREMENT
 , firstName TEXT NOT NULL
 , lastName TEXT NOT NULL
 , emailAddress TEXT NOT NULL UNIQUE
 , isActive INTEGER NOT NULL DEFAULT 1
 , createdDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
 , lastModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Best Practices

* Use **parameterized queries** to prevent SQL injection
* Avoid dynamic SQL with string concatenation
* Consider NULL values in logic; use COALESCE for defaults
* Keep queries focused on single purpose
* Break complex queries into views or CTEs when appropriate
* SQLite supports both ordinary and recursive CTEs
* Comment complex business logic and non-obvious performance considerations

## swift

These standards supplement the Silvermine coding standards. Where Swift community
conventions conflict with the general standard, the Swift-specific rule takes precedence.

## Principles

* Prefer value types (structs) over reference types (classes) unless you need identity
  semantics or inheritance
* Use Swift's type system for safety (optionals, enums with associated values,
  protocols)
* Use Swift Concurrency (async/await, actors) over callback patterns
* Follow Swift API Design Guidelines for naming

## Formatting

* One blank line between method definitions
* No blank line after opening brace or before closing brace
* One space after colon in type declarations, no space before
* Break long lines at logical points; indent continuation lines by 3 spaces

## Naming Conventions

**Overrides from general standard:** Swift uses camelCase for all functions and properties,
including static members. Do not use `snake_case` for static functions,
`UPPER_SNAKE_CASE` for constants, or underscore prefixes for private members.

* **camelCase** for all variables, functions, and properties (including static)
* **PascalCase** for types (classes, structs, enums, protocols)
* Constants use `let` with camelCase (not `UPPER_SNAKE_CASE`)
* Verbs for functions that perform actions
* Noun phrases for functions returning values without side effects
* Omit `get` and `list` prefixes for accessor methods
* Boolean properties: `is`, `has`, `can`, `should` prefixes
* Enum case names: lowerCamelCase
* Protocols: nouns for what something _is_; `-able`/`-ible`/`-ing` for capabilities

### Function Examples

```swift
// Good
func remove(at index: Int)
func user(id: String) -> User?
func activeUsers() -> [User]
func fetchUser(id: String) async throws -> User

// Bad
func removeItem(atIndex index: Int)
func getUser(id: String) -> User?
func listUsers() -> [User]
```

## Code Organization

* Use the most restrictive access control possible; default to `private`
* One type per file unless types are closely related
* Ordering: properties, initializers, computed properties, public methods, private
  methods
* Use extensions to organize code by functionality (one protocol per extension)

### Value Types vs Reference Types

* Structs: simple data values, properties are themselves value types
* Classes: identity semantics or inheritance needed
* Actors: thread-safe shared mutable state

## Swift Features

### Optionals

* **Never** force unwrap (`!`) except in tests or when truly impossible to be nil
* Use optional binding (`if let`, `guard let`) for safe unwrapping
* Use nil coalescing (`??`) for default values

### Error Handling

* Use `throw`/`catch` for recoverable errors
* Use `guard` for early returns; the `else` block must exit scope
* Provide meaningful error types with enums

### Concurrency

* Use Swift Concurrency (`async`/`await`, actors)
* Use Swift 6 strict concurrency checking and `@Sendable` annotations
* Use `async let` for concurrent tasks
* Use actors for thread-safe shared mutable state

### Closures

* Use trailing closure syntax when the closure is the last argument
* Prefer named parameters over shorthand (`$0`, `$1`) for closures longer than a
  single expression
* Be explicit about capture lists

## Memory Management

* Avoid strong reference cycles with `weak` and `unowned`
* Use value types (structs) when appropriate to avoid reference cycle concerns
* Be explicit about capture lists in closures

```swift
func updateProfile() {
   networkService.fetch { [weak self] result in
      guard let self else { return }
      self.updateUI(with: result)
   }
}
```

## Documentation

Swift uses `///` documentation comments with `- Parameters:` and `- Returns:` markup
instead of JSDoc:

```swift
/// Calculates the total price including tax
///
/// - Parameters:
///   - items: The items to calculate the price for.
///   - taxRate: The tax rate to apply.
/// - Returns: The total price with tax applied
func calculateTotal(for items: [Item], taxRate: Double) -> Double {
   // Implementation
}
```

## Testing

* Prefer Swift Testing framework (`@Test`, `#expect`) over XCTest for new tests
* Test all public interfaces
* Follow Arrange-Act-Assert pattern

## Dependency Management (Swift Package Manager)

* Always specify exact versions for dependencies
* Avoid version ranges or branch dependencies in production code

```swift
// Good
dependencies: [
    .package(url: "https://github.com/apple/swift-log.git", exact: "1.4.2"),
]

// Bad
dependencies: [
    .package(url: "https://github.com/apple/swift-log.git", from: "1.0.0"),
]
```
<!-- END AIX MANAGED SECTION -->

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
   Do NOT run `bd dolt push`. Beads has no dolt remote, on purpose. Pushing the beads
   database into this repo writes a `__dolt_remote_info__` branch and a `refs/dolt/data`
   ref, and Vercel then tries to deploy a tree with no `package.json`, so every such
   deployment fails. Beads data stays local.
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
