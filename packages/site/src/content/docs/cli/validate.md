---
sidebar:
   order: 9
title: aix validate
description: Check ai.json against the schema and the lockfile.
---

Loads `ai.json`, applies `extends` and `ai.local.json`, and checks the result against the
`ai.json` schema. It does not change any editor config.

## Usage

```bash
aix validate [flags]
```

The command checks the `ai.json` in the working directory or a parent directory. Pass
`--config <path>` to check another file.

If the config is valid, the command prints `Configuration is valid`. If not, it prints the
path of each invalid field with a description of the problem and exits with a non-zero
status. It also fails when no `ai.json` is found, or when an extended config cannot be
loaded.

## Flags

| Flag     | Description                                        |
| -------- | -------------------------------------------------- |
| `--lock` | Create or refresh `ai.lock.json` after validating. |
| `--json` | Print the result as one JSON document.             |

## JSON output

`--json` always prints exactly one document. For a valid config it holds the path of the
file, the path of the lockfile if there is one, and the merged config:

```json
{
   "valid": true,
   "path": "/path/to/project/ai.json",
   "source": "file",
   "config": {}
}
```

For schema errors it lists them:

```json
{
   "valid": false,
   "errors": [{ "path": "mcp.playwright", "message": "Expected object or false, received true" }]
}
```

For any other failure, such as a missing `ai.json`, it holds one message:

```json
{
   "valid": false,
   "error": "No ai.json found. Run `aix init` to create one."
}
```

## Lockfiles

```bash
aix validate --lock
```

`--lock` creates or refreshes `ai.lock.json` beside `ai.json`. After that, plain
`aix validate` also checks the lockfile and fails if the resolved config has changed.
