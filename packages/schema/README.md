# @a1st/aix-schema

Zod schemas and JSON Schema for [aix](https://github.com/a1st-dev/aix/blob/main/README.md)
configuration files.

## Role in aix

This package defines the structure and validation for `ai.json` files. It's used by
`@a1st/aix-core` and `@a1st/aix` to parse and validate configurations.

## Features

- **Zod schemas** — Runtime validation with TypeScript inference
- **JSON Schema** — IDE autocompletion and validation via `schema.json`
- **Normalization** — Convert shorthand syntax to canonical object form

## Key Exports

```typescript
import {
  parseConfig,          // Parse and validate a full ai.json config
  parseLocalConfig,     // Parse config allowing local-only fields
  aiJsonSchema,         // Zod schema for ai.json
  type AiJsonConfig,    // TypeScript type for validated config
} from '@a1st/aix-schema';
```

## JSON Schema

The package exports `schema.json` for IDE integration:

```json
{
  "$schema": "node_modules/@a1st/aix-schema/schema.json"
}
```

## Installation

```bash
npm install @a1st/aix-schema
```

> **Note:** This package is primarily for internal use. Most users should install
> `@a1st/aix` (the CLI) instead.

## License

MIT
