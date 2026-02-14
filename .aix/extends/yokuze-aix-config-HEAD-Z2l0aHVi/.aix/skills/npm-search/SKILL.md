---
name: npm-search
description: Search for npm packages to solve problems instead of writing custom code. Use when the user needs functionality that likely exists as a package, or when evaluating whether to build vs. use an existing solution.
---

# NPM Search

Before writing custom code to solve a problem, check if an npm package already exists. This saves time, reduces bugs, and leverages community-tested solutions.

## When to use this skill

- The project has a package.json file and uses NPM/Node
- User asks for functionality that sounds like a common problem (date formatting, validation, HTTP requests, etc.)
- You're about to write > 100 lines of utility code
- A package that solves the problem is not already in package.json
- User explicitly asks to find a package

## How to search

Run `npm search` with relevant keywords:

```bash
npm search <keywords> --long
```

The `--long` flag shows additional details including description, author, date, version, and keywords.

### Search tips

- Use multiple keywords to narrow results: `npm search date format timezone --long`
- Try synonyms if initial search yields poor results
- Search for the problem, not the solution (e.g., "csv parse" not "string split comma")

## Evaluating packages

When presenting options to the user, consider:

1. **Popularity** - Higher download counts generally indicate reliability and community support
2. **Maintenance** - Check the publish date; prefer packages updated within the last year
3. **Fit** - Does it solve the exact problem without excessive overhead?

### Present to user

When the user is looking for a package, include:
- Package name
- Description
- Version
- Weekly downloads (if available via `npm view <pkg> --json`)
- Last publish date
- License

### Acceptable trade-offs

For niche problems, less popular or less recently maintained packages are acceptable if:
- They solve the specific problem well
- No better alternatives exist
- The code is simple enough to fork/maintain if needed

## Example workflow

1. User asks: "I need to validate email addresses"
2. Check if a package is already in package.json. If not:
    1. Search: `npm search email validate --long`
    2. Evaluate top results for popularity and maintenance
    3. Recommend 1-3 options with rationale
    4. If user approves, install with `npm install --save-exact <package>` (or --save-dev
       if it's a dev dependency)
