---
trigger: glob
globs: "**/*.ts"
---

Follow these standards:

   * https://github.com/silvermine/silvermine-info/raw/refs/heads/master/coding-standards/typescript.md
   * https://raw.githubusercontent.com/silvermine/silvermine-info/refs/heads/master/coding-standards.md

## General Code Style & Formatting

   * Use English for all code and documentation
   * Use JSDoc to document public classes and methods
   * ALWAYS wrap comments to utilize the full line length
   * Combine adjacent single-line const/let/var declarations into one declaration
   * Use early returns to reduce indentation

## Naming Conventions

   * Use PascalCase for classes
   * Use camelCase for variables, functions, and methods
   * Use kebab-case for file and directory names
   * Use UPPERCASE for environment variables
   * Avoid magic numbers and define constants
   * When it has an acronym or initialism, use all lowercase or all caps, never mixed-case:
      * `url` or `URL`, _never_ `Url`
      * `id` or `ID`, _never_ `Id`. Prefer `ID` over `id` when writing docs/sentences
        unless documenting a third-party entity or when specifically referring to a code
        object with that exact casing (parameter, variable, etc.)

## Functions & Logic

   * Avoid deeply nested blocks by:
      * Using early returns
      * Extracting logic into utility functions
   * Use higher-order functions (map, filter, reduce) to simplify logic
   * Use arrow functions for simple cases (<3 instructions), named functions otherwise
   * Use default parameter values instead of null/undefined checks
   * Use RO-RO (Receive Object, Return Object) for passing and returning multiple
     parameters

## Data Handling

   * Avoid excessive use of primitive types; encapsulate data in composite types
   * Prefer immutability for data:
      * Use readonly for immutable properties
      * Use `as const` for literals that never change

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

## ABSOLUTELY DO NOT:

   * DO NOT Use `any` in TS code
