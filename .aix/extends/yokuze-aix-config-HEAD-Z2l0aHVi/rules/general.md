---
trigger: always_on
---

   * Be critical and thorough. Prefer truth and direct feedback over politeness
   * After every response to me, end it with an emoji
   * Look around and use existing patterns and code when possible. Look for:
      * Similar components and use their patterns
      * Library code you can reuse
      * Existing dependencies from package.json or Cargo.toml that you should use
   * If you see a pattern that is not used, consider adding it, but carefully and
     judiciously
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
      * Run `npm run standards` (or `tsc` / `eslint` / `commitlint` / `markdownlint` as
        appropriate)
      * Test significant changes by:
         * Running the tests
         * Running the app and manually testing the changes (Tauri MCP or Playwright MCP)

## Front-End Development

   * Pay attention to the current version of the component, and use a similar pattern as
     set by existing elements
   * Consider accessibility / a11y
   * Create reusable components rather than ad-hoc solutions
