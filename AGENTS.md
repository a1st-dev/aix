# Agents

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

* Readability and clarity over brevity
* Follow existing patterns in the codebase before inventing new ones
* Do deep research to find existing libraries (NPM, GitHub, Cargo, etc.) that solve
  problems instead of writing code
   * Code writing is a last resort
* Separate formatting-only changes from functional changes

## Working Habits

* Be critical and thorough. Prefer truth and direct feedback over politeness
* Look around and use existing patterns and code when possible. Look for:
   * Similar components and use their patterns
   * Library code you can reuse
   * Existing dependencies from package.json or Cargo.toml that you should use
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
   * Test significant changes by:
      * Running the tests
      * Running the app and manually testing the changes (Tauri MCP/CLI or Playwright MCP/CLI)

## Naming Conventions (General)

* Use PascalCase for classes
* Use camelCase for variables, instance functions, and methods
* Use snake_case for static functions
* Use kebab-case for file and directory names
* Use UPPERCASE for environment variables
* Files exporting classes: PascalCase.js (e.g., `User.js`)
* Files exporting functions/objects: kebab-case.js (e.g., `my-function.js`)
* Tests: `ClassTheyAreTesting.test.js`
* Avoid magic numbers and define constants
* When it has an acronym or initialism, use all lowercase or all caps, never mixed-case:
   * `url` or `URL`, _never_ `Url`
   * `id` or `ID`, _never_ `Id`. Prefer `ID` over `id` when writing docs/sentences
      unless documenting a third-party entity or when specifically referring to a code
      object with that exact casing (parameter, variable, etc.)

## Formatting Rules

### Indentation

* **3 spaces** (never tabs)
* Wrapped lines: indent one level from first line
* Chained functions: indent one level from chain start

### Braces & Structure

* Opening brace at end of line (K&R style)
* Always use braces for conditionals/loops (even single line)
* One blank line between unrelated statements
* One-two blank lines between functions

### Spacing & Operators

* Space after control structures: `if (condition)`
* No space between function name and parenthesis: `myFunction()`
* No space between `catch` and parentheses: `catch(error) {`
* Space around operators (except unary: `!`, `++`, `--`)
* Space after commas in arrays/arguments
* Spaces inside array brackets: `[ 'item' ]` and object braces: `{ key: 'value' }`
* Empty arrays/objects: no spaces (`[]`, `{}`)
* Multi-line arrays/objects: always trailing comma

## Control Structures

* Avoid deep nesting (low cyclomatic complexity)
* Most common case in `if` (not `else`)
* Use positive logic over negative
* Break complex conditions into variables/functions
* Check error conditions early with early returns
* Do not add defensive empty checks before operations that naturally handle empty inputs

## Variable Best Practices

* Declare in lowest possible scope
* Declare at top of scope before statements
* Initialized variables before uninitialized
* Avoid modifying input parameters (except immediate sanitization)
* Always sanitize user input
* Prefer immutability (`readonly`, `as const`, `const`)

## Function Documentation

* Document the function purpose in JSDoc format
* Document types or parameters if they are not obvious from the code
* Omit JSDoc entirely when the function name already conveys its purpose
   (e.g., do not add `/** Creates the foo */` to `createFoo()`)
* Add JSDoc comments to enum values when the name alone doesn't convey the
   domain-specific meaning

## Comments

* Only add a comment if:
   * The code's rationale is not obvious from naming/context
   * The comment answers "why," NOT "what" or "how"
   * The surrounding code uses comments in a similar way
* Do not comment on types, parameters, or usage that are clear from code or naming
* Use ASCII in comments, never unicode symbols

## File Standards

* End with newline character (not blank line)
* No Windows line endings
* No commented-out code without reason
* Ternary operator only for simple conditions

## Front-End Development

* Pay attention to the current version of the component, and use a similar pattern as
  set by existing elements
* Consider accessibility / a11y
* Create reusable components rather than ad-hoc solutions

## Library Usage

* Use existing libraries to the fullest extent possible
* Always verify function signatures before using

## css-scss

* Always use SCSS, not CSS
* If using a component library, use the component's existing props or built-in options
  over custom styling. Reuse appropriate CSS classes
* If none are available, prefer pre-existing utility classes over custom styling
* Avoid ad-hoc CSS unless absolutely necessary
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
`css.preprocessorOptions`), these are generally libraries and you should prefer these
mixins/vars/functions over hard-coded values.

Check the project's `vite.config.ts` or equivalent to see what is available.

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

* ABSOLUTELY DO NOT create ad-hoc test scripts. If you absolutely must, clean up those
  files when you're done
* ABSOLUTELY DO NOT ignore "pre-existing" TypeScript or linting errors. If you see them,
  fix them before proceeding
* ABSOLUTELY DO NOT ignore "pre-existing" tests that fail. If you see them, fix them
  before proceeding
* ABSOLUTELY DO NOT ignore "pre-existing" documentation that is out of date. If you see
  it, fix it before proceeding
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
* ABSOLUTELY DO NOT include `Co-Authored-By` statements in git commit messages

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

## Subject Line Requirements

* **72 characters maximum** for the full header (type + scope + subject + issue)
* Use imperative mood ("add feature" not "added feature" or "adds feature")
* Lowercase start (except proper nouns)
* Do not end with a period
* Include issue number in format `(#xxxxx)` at the end
* If multiple issues, include additional numbers in the body/footer instead
* Describe **what** the commit does, not what was wrong

## Body Requirements

* Separate from subject with a blank line
* **90 characters maximum** per line
* Explain **why** — but only if the subject doesn't fully explain the commit on its own
* Bodies are discouraged for simple commits. Only add a body when you have a reason to
  explain why the change was made
* Describe the outcome or behavior change, not the implementation mechanism
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

* Always use context7 when you need code generation, setup or configuration steps, or
  library/API documentation. Automatically use the Context7 MCP tools to resolve library
  ID and get library docs without being explicitly asked
* If you make UI changes, use MCP tools to test them in a real environment unless
  project-specific rules say not to
   * Use the Tauri MCP when working within a Tauri app
   * Use Playwright for other projects

## npm

* Always use `npm` instead of `pnpm` or `yarn`
* Always use the `--save-exact` flag when installing a dependency
* Use the `-y` flag with `npx` when running a command
* Use project-defined `npm` scripts instead of equivalent CLI commands

* ABSOLUTELY DO NOT introduce new dependencies without verifying the license is
  admissible (see dependency-licenses.md)

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

* When writing tests, prefer practical e2e tests over unit tests, but add unit tests for
  critical functionality or complex logic
* If you write tests, always run them
* Use descriptive test names that explain the expected behavior
* Group related tests with `describe()` blocks
* Add blank line before `expect` / assertion statements
* Follow the Arrange-Act-Assert pattern

## Assertion Rules

* Do NOT use `.to.be.true` or `.to.be.false`. Use `.to.strictlyEqual(true)` or
  `.to.strictlyEqual(false)` instead
* Use `.to.eql()` for deep equality comparisons

## typescript-javascript

Follow these standards:

* https://github.com/silvermine/silvermine-info/raw/refs/heads/master/coding-standards/typescript.md
* https://raw.githubusercontent.com/silvermine/silvermine-info/refs/heads/master/coding-standards.md

## Core Principles

* Use `let` and `const` instead of `var`
* Prefer `const` for immutable variables
* Group consecutive declarations in one statement; avoid separate `const` for simple,
  related assignments
* Avoid multi-line `const` declarations (complex objects get their own block)
* Use template literals when they improve readability; avoid multi-line template literals
* Use `String()` for explicit string conversion
* Prefer `async/await` over Promise chaining
* Use `Promise.all()` for concurrent async operations
* Use English for all code and documentation
* Always wrap comments to utilize the full line length
* Code must be 140 characters or less; comments must be 91 characters or less
* Use early returns to reduce indentation

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

* Use PascalCase for classes
* Use camelCase for variables, functions, and methods
* Use snake_case for static functions
* Use kebab-case for file and directory names
* Use UPPERCASE for environment variables
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

* Avoid deeply nested blocks by using early returns and extracting logic
* Use higher-order functions (map, filter, reduce) to simplify logic
* Arrow function parameters must have parentheses and explicit returns (good: `(a) => {
  return value; }`, bad: `a => a.value`)
* No implicit returns in arrow functions; no arrow functions as class properties
* Use arrow functions for simple cases (<3 instructions), named functions otherwise
* Use default parameter values instead of null/undefined checks
* Use RO-RO (Receive Object, Return Object) for passing and returning multiple parameters
* Use rest parameters instead of `arguments`
* Point-free style: when a callback is simply a direct function reference, pass it
  directly (good: `rules.map(lankFromRule)`, bad: `rules.map((rule) => { return
  lankFromRule(rule); })`)

## Destructuring

* Basic object/array destructuring: yes
* Array destructuring with rest: yes
* Object destructuring with rest: avoid (risky)
* Array destructuring with ignores: use with caution
* Renaming while destructuring: yes
* Deep data destructuring: avoid (not readable)

## Types (TypeScript)

* No implicit `any` types; never use `any`
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
* Be cautious with string-based error checks

## Imports

* If a `process.env` value must be set before an import, place the assignment at the top
  of the file, before imports
* When `process.env` values come from CLI args: import arg parser first, parse args,
  assign `process.env`, then import everything else

## vue

Assume Vue 3.5+ with the Composition API and Single-File Components (SFCs) unless
`package.json` indicates otherwise.

## ABSOLUTELY DO NOT

* ABSOLUTELY DO NOT use `v-html` in Vue templates; use `v-html-content` directive instead
  (sanitizes via DOMPurify)

## SFC Structure

Every component follows this block order:

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

### TypeScript interface props (preferred)

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

For v-model bindings, use `defineModel` (Vue 3.4+):

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

### Slot props

Pass CSS classes and internal state to slot consumers via `v-bind`:

```vue
<slot v-bind="{ cssClasses: buttonCSSClasses }">
   <!-- default content -->
</slot>

<slot name="title" v-bind="{ title, className: cardCSSClasses.cardTitle, id: titleID }">
   <h3 :id="titleID" :class="cardCSSClasses.cardTitle">{{ title }}</h3>
</slot>
```

### Checking slot existence

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

### Dynamic element rendering

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
   level of `<script setup>`. Guard behind `onMounted` or `typeof window !== 'undefined'`
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

## Content

* **Be specific, not generic.** Replace vague claims of importance with concrete facts.
   "Inventor of the first train-coupling device" instead of "a revolutionary titan of
   industry."
* **Skip the significance speeches.** Do not add sentences about how something "marks a
   pivotal moment," "represents a broader trend," "highlights the enduring legacy," or
   "underscores the importance." Let facts speak for themselves.
* **Avoid superficial analysis.** Do not attach "-ing" phrases that editorialize:
   "creating a lively community," "showcasing the brand's dedication," "demonstrating
   ongoing relevance."
* **No promotional language.** Cut puffery like "nestled within," "vibrant," "rich
   tapestry," "seamlessly connecting," "gateway to," "breathtaking." Write neutrally.
* **Attribute specifically or not at all.** Do not use weasel phrases like "has been
   described as," "is considered," "researchers note," "scholars argue" without naming
   who. If you cannot name a source, remove the claim.
* **Do not exaggerate consensus.** Do not present one or two sources as "several
   publications" or "multiple scholars." Do not imply lists are non-exhaustive when
   sources give no indication other examples exist.
* **Skip "Challenges and Future Prospects" formulas.** Do not write "Despite its [positive
   words], [subject] faces challenges..." followed by vague optimism about future
   initiatives.
* **No hedging preambles.** Do not acknowledge something is "relatively minor" before
   explaining its importance anyway.

## Word Choice

Avoid overused AI vocabulary:

* **High-frequency offenders:** delve, tapestry, landscape, multifaceted, intricate,
   nuanced, pivotal, comprehensive, innovative, cutting-edge, groundbreaking,
   transformative, paradigm, foster, leverage, spearhead, underscore, highlight, crucial,
   vital, robust, seamless, holistic, synergy, realm, beacon, testament, embark, unveil,
   unravel, commendable, meticulous, intrinsic, Moreover, Furthermore, Notably,
   Importantly, Indeed, Thus, Hence, Therefore, Consequently
* One or two may be coincidental; clusters are evidence of overuse

## Grammar & Structure

* **Use simple verbs.** Prefer "is" and "are" over "serves as," "stands as," "marks,"
   "represents," "constitutes," "features," "offers." Write "She is chairman" not "She
   serves as chairman."
* **Avoid negative parallelisms.** Do not write "not only ... but also," "it's not just
   about ... it's ...," "not ... but rather." These constructions try to appear balanced
   but often add nothing.
* **Break the rule of three.** Do not default to "adjective, adjective, and adjective" or
   "phrase, phrase, and phrase" patterns. Vary list lengths.
* **Avoid elegant variation.** If you name something, use that name again. Do not cycle
   through synonyms like "the protagonist," "the key player," "the eponymous character" to
   avoid repetition.
* **No false ranges.** "From X to Y" requires a real scale. "From the Big Bang to the
   cosmic web" or "from problem-solving to artistic expression" are meaningless ranges
   that sound impressive but say nothing.

## Formatting & Style

* **Use sentence case for headings.** Do not capitalize every word in section titles.
* **Avoid excessive boldface.** Do not bold every key term or create "key takeaways" lists
   with bolded headers.
* **No emojis** unless explicitly requested

## Communication

* **No meta-commentary.** Do not include phrases like "In this section, we will
   discuss..." or "Below is a detailed overview based on available information."
* **No disclaimers about knowledge gaps.** Do not write "While specific details are not
   extensively documented..." or "As of my last knowledge update..."
* **No placeholder text.** Do not leave brackets like [describe the specific section] or
   dates like 2025-XX-XX.
* **No collaborative language in output.** Do not write "Would you like me to..." or
   "Here's a template you can customize" in content meant for publication.

Source: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing

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

## Lists

* Always indent lists by 3 spaces
* Always use `*` for unordered lists instead of `-`
* Include a newline before and after the list

## Code Blocks

* Always include a tag to specify the language, even if it's `txt`

* Run `npm run standards` if available to lint with `markdownlint`

## sql

## Core Principles

* Readability and clarity through vertical alignment
* UPPERCASE keywords and functions
* Explicit column names (never `SELECT *`)
* Consistent formatting and indentation

## Formatting Rules

### Indentation and Alignment

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

## Naming Conventions

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

These standards supplement the general Silvermine coding standards. Where Swift community
conventions conflict with the general standard, the Swift-specific rule takes precedence.

## Core Principles

* Prefer value types (structs) over reference types (classes) unless you need identity
  semantics or inheritance
* Leverage Swift's type system for safety (optionals, enums with associated values,
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
* Leverage Swift 6 strict concurrency checking and `@Sendable` annotations
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
