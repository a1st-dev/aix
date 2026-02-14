---
trigger: always_on
---

You ABSOLUTELY must not:

   * DO NOT `git push` without express permission
   * DO NOT create ad-hoc test scripts. If you absolutely must, clean up those files when
     you're done
   * DO NOT ignore "pre-existing" TypeScript or linting errors. If you see them, fix them
     before proceeding
   * DO NOT ignore "pre-existing" tests that fail. If you see them, fix them before
     proceeding
   * DO NOT ignore "pre-existing" documentation that is out of date. If you see it, fix
     it before proceeding
   * DO NOT use `@deprecated` on anything unless you are explicitly asked to. Always fully refactor
     and delete old code as-needed instead of deprecating it
   * DO NOT implement functionality that already exists in a library or package,
     especially if that package is already installed in the project
     * Examples: parsing, validation, formatting
   * DO NOT disable linting rules (ESLint, oxlint, clippy, etc.) in the config to get
     around linting errors. Fix the underlying issues
